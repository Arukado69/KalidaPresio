// functions/api/subscribe.js  →  POST /api/subscribe
// Paso 1 del doble opt-in: valida, genera token HMAC firmado y manda el correo
// de confirmación. SIN base de datos (el token ES el estado). SIN passwords.

import { crearToken, emailValido } from '../_lib/token.js';
import { sendEmail, json } from '../_lib/email.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'json_invalido' }, 400); }

  const email = String(body?.email || '').toLowerCase().trim();
  const honeypot = body?.honeypot;

  // Honeypot lleno → es un bot. Respondemos 200 FALSO (descartamos en silencio).
  if (honeypot) return json({ ok: true });

  if (!emailValido(email)) return json({ ok: false, error: 'email_invalido' }, 400);

  if (!env?.SUBSCRIBE_SECRET) {
    console.error('[boletín] Falta SUBSCRIBE_SECRET en el entorno.');
    return json({ ok: false, error: 'config_incompleta' }, 500);
  }

  // TODO (rate limiting): si se vuelve necesario, limitar por IP con
  // Cloudflare KV o Turnstile. Por ahora el honeypot + doble opt-in bastan.
  // const ip = request.headers.get('CF-Connecting-IP');

  let token;
  try {
    token = await crearToken(email, env.SUBSCRIBE_SECRET); // expira en 24 h
  } catch (e) {
    console.error('[boletín] error al firmar token:', e);
    return json({ ok: false, error: 'token_error' }, 500);
  }

  const site = (env.PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  const enlace = `${site}/api/confirm?token=${encodeURIComponent(token)}`;

  try {
    await sendEmail({
      to: email,
      subject: 'Confirma tu suscripción a KalidaPresio',
      text: `Confirma tu suscripción abriendo este enlace (válido 24 h): ${enlace}\n\nSi no fuiste tú, ignora este correo.`,
      html: correoConfirmacion(enlace),
      env,
    });
  } catch (e) {
    // Sin ESP configurado / fallo de envío: degradamos controlado y logueamos.
    console.error('[boletín] no se pudo enviar el correo de confirmación:', e);
    return json({ ok: false, error: 'envio_fallido' }, 502);
  }

  return json({ ok: true });
}

// Otros métodos → 405
export const onRequest = ({ request }) =>
  request.method === 'POST' ? undefined : json({ ok: false, error: 'metodo_no_permitido' }, 405);

function correoConfirmacion(enlace) {
  // Correo simple, marca KalidaPresio. (El ESP envuelve el envío.)
  return `<!doctype html><html lang="es"><body style="margin:0;background:#140e1f;font-family:Arial,Helvetica,sans-serif;color:#f0eef8">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <h1 style="color:#1fd28e;font-size:20px;margin:0 0 8px">KalidaPresio</h1>
    <p style="font-size:15px;line-height:1.6;color:#d9d4ec">Confirma tu suscripción para recibir, de vez en cuando, las mejores ofertas calidad-precio que detectamos. Nada de spam.</p>
    <p style="margin:24px 0">
      <a href="${enlace}" style="display:inline-block;background:#1fd28e;color:#0b231a;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:10px">Confirmar suscripción</a>
    </p>
    <p style="font-size:12px;color:#a59cc4;line-height:1.5">El enlace caduca en 24 horas. Si no solicitaste esto, ignora este correo y no pasará nada.</p>
  </div></body></html>`;
}
