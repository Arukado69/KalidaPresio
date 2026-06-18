// functions/api/contact.js  →  POST /api/contact
// Canal de soporte: envía el mensaje a SUPPORT_INBOX y una auto-respuesta al
// usuario. Reutiliza sendEmail() del Bloque C (no se duplica el ESP).

import { sendEmail, json } from '../_lib/email.js';
import { emailValido } from '../_lib/token.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'json_invalido' }, 400); }

  const nombre = String(body?.nombre || '').trim().slice(0, 120);
  const email = String(body?.email || '').toLowerCase().trim();
  const mensaje = String(body?.mensaje || '').trim().slice(0, 4000);
  const honeypot = body?.honeypot;

  // Honeypot lleno → bot. 200 falso, descartado en silencio.
  if (honeypot) return json({ ok: true });

  if (!nombre || !emailValido(email) || mensaje.length < 5) {
    return json({ ok: false, error: 'campos_invalidos' }, 400);
  }
  if (!env?.SUPPORT_INBOX) {
    console.error('[contacto] Falta SUPPORT_INBOX en el entorno.');
    return json({ ok: false, error: 'config_incompleta' }, 500);
  }

  try {
    // 1) Mensaje a soporte (reply-to del usuario → responder es directo). INTEGRACIÓN ESP (vía sendEmail)
    await sendEmail({
      to: env.SUPPORT_INBOX,
      replyTo: email,
      subject: `Soporte KalidaPresio — ${nombre}`,
      text: `De: ${nombre} <${email}>\n\n${mensaje}`,
      html: `<p><strong>De:</strong> ${escapeHtml(nombre)} &lt;${escapeHtml(email)}&gt;</p><p style="white-space:pre-wrap">${escapeHtml(mensaje)}</p>`,
      env,
    });
    // 2) Auto-respuesta al usuario. INTEGRACIÓN ESP (vía sendEmail)
    await sendEmail({
      to: email,
      subject: 'Recibimos tu mensaje — KalidaPresio',
      text: `Hola ${nombre}, recibimos tu mensaje y lo revisaremos pronto. Gracias por escribir a KalidaPresio.`,
      html: `<p>Hola ${escapeHtml(nombre)},</p><p>Recibimos tu mensaje y lo revisaremos pronto. Gracias por escribir a KalidaPresio.</p>`,
      env,
    });
  } catch (e) {
    console.error('[contacto] fallo al enviar:', e);
    return json({ ok: false, error: 'envio_fallido' }, 502);
  }

  return json({ ok: true });
}

export const onRequest = ({ request }) =>
  request.method === 'POST' ? undefined : json({ ok: false, error: 'metodo_no_permitido' }, 405);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
