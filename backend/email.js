// backend/email.js
// Capa de ESP (Email Service Provider) AISLADA y reemplazable. El resto del
// backend solo llama a enviarCorreo() — para cambiar de proveedor, edita SOLO
// este archivo. Default: Resend.
//
// Port de functions/_lib/email.js al backend que sí se despliega.
// Variables de entorno: RESEND_API_KEY, EMAIL_FROM.

const PALETA = {
  fondo: '#140e1f',
  texto: '#f0eef8',
  suave: '#d9d4ec',
  tenue: '#a59cc4',
  acento: '#1fd28e',
  tintaBoton: '#0b231a',
};

/** true si hay un ESP configurado. Sin esto, el boletín no puede funcionar. */
export const espConfigurado = () => Boolean(process.env.RESEND_API_KEY);

/**
 * Envía un correo transaccional. Lanza si falta config o si el ESP responde
 * mal (el caller decide cómo degradar).
 * @param {{to: string|string[], subject: string, html: string, text?: string, replyTo?: string}} opts
 */
export async function enviarCorreo({ to, subject, html, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY no configurada');
  const from = process.env.EMAIL_FROM || 'KalidaPresio <onboarding@resend.dev>';

  // ───────────────────────── INTEGRACIÓN ESP ─────────────────────────
  // Llamada al proveedor (Resend). Si usas otro ESP (SendGrid, Postmark,
  // Mailchimp Transactional…), reemplaza SOLO este bloque manteniendo la firma.
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(text ? { text } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
  // ───────────────────────── FIN INTEGRACIÓN ESP ─────────────────────
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`ESP respondió ${res.status}: ${detalle.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

/** Escapa texto que va a interpolarse dentro de HTML. */
export function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}

/** Envoltura común de los correos de marca. */
function plantilla(cuerpo, enlaceBaja) {
  const pie = enlaceBaja
    ? `<p style="font-size:12px;color:${PALETA.tenue};line-height:1.5;margin-top:28px;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">
         ¿Ya no quieres estos correos? <a href="${enlaceBaja}" style="color:${PALETA.tenue}">Date de baja en un clic</a>.
       </p>`
    : '';
  return `<!doctype html><html lang="es"><body style="margin:0;background:${PALETA.fondo};font-family:Arial,Helvetica,sans-serif;color:${PALETA.texto}">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <h1 style="color:${PALETA.acento};font-size:20px;margin:0 0 16px">KalidaPresio</h1>
    ${cuerpo}
    ${pie}
  </div></body></html>`;
}

/** Correo de confirmación del doble opt-in (paso 1). */
export function correoConfirmacion(enlace) {
  return plantilla(`
    <p style="font-size:15px;line-height:1.6;color:${PALETA.suave}">
      Confirma tu suscripción para recibir, de vez en cuando, las mejores ofertas
      calidad-precio que detectamos. Nada de spam.
    </p>
    <p style="margin:24px 0">
      <a href="${enlace}" style="display:inline-block;background:${PALETA.acento};color:${PALETA.tintaBoton};font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:10px">Confirmar suscripción</a>
    </p>
    <p style="font-size:12px;color:${PALETA.tenue};line-height:1.5">
      El enlace caduca en 24 horas. Si no solicitaste esto, ignora este correo y no pasará nada.
    </p>`);
}

/** Correo de bienvenida tras confirmar (paso 2). Ya lleva enlace de baja. */
export function correoBienvenida(enlaceBaja) {
  return plantilla(`
    <p style="font-size:15px;line-height:1.6;color:${PALETA.suave}">
      Listo, ya estás dentro. Te escribiremos solo cuando encontremos algo que de
      verdad valga la pena — no cada semana por costumbre.
    </p>
    <p style="font-size:15px;line-height:1.6;color:${PALETA.suave}">
      Recuerda: los precios que publicamos son una foto del momento en que los
      detectamos. Verifica siempre el precio final en Mercado Libre antes de comprar.
    </p>`, enlaceBaja);
}
