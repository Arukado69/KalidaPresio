// functions/_lib/email.js
// Capa de ESP (Email Service Provider) AISLADA y reemplazable. El resto del
// código solo llama a sendEmail() / confirmarEnAudiencia() — para cambiar de
// proveedor, edita SOLO este archivo. Default: Resend.
//
// Variables de entorno usadas: RESEND_API_KEY, EMAIL_FROM.

/**
 * Envía un correo transaccional. Lanza si falta config o si el ESP responde mal
 * (el caller decide cómo degradar).
 * @param {{to:string|string[], subject:string, html:string, text?:string, replyTo?:string, env:object}} opts
 */
export async function sendEmail({ to, subject, html, text, replyTo, env }) {
  if (!env?.RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada');
  const from = env.EMAIL_FROM || 'KalidaPresio <onboarding@resend.dev>';

  // ───────────────────────── // INTEGRACIÓN ESP ─────────────────────────
  // Llamada al proveedor (Resend). Si usas otro ESP (SendGrid, Postmark,
  // Mailchimp Transactional…), reemplaza SOLO este bloque manteniendo la firma.
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
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
  });
  // ───────────────────────── // FIN INTEGRACIÓN ESP ─────────────────────
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`ESP respondió ${res.status}: ${detalle.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Marca/añade el email como CONFIRMADO en la audiencia del ESP. Aislado para
 * que conectes tu lista. No es bloqueante: si falla, el caller lo loguea pero
 * igual muestra "confirmado" al usuario (la confirmación criptográfica ya pasó).
 * @param {{email:string, env:object}} opts
 */
export async function confirmarEnAudiencia({ email, env }) {
  // ───────────────────────── // INTEGRACIÓN ESP ─────────────────────────
  // Alta en la audiencia de Resend. Necesita RESEND_AUDIENCE_ID (créala en el
  // dashboard de Resend → Audiences). Si no está configurada, no hacemos nada
  // (el doble opt-in criptográfico ya validó; conecta tu lista cuando quieras).
  if (!env?.RESEND_API_KEY || !env?.RESEND_AUDIENCE_ID) {
    console.warn('[boletín] RESEND_AUDIENCE_ID no configurada: no se añadió a la audiencia (conectar ESP).');
    return { skipped: true };
  }
  const res = await fetch(`https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, unsubscribed: false }),
  });
  // ───────────────────────── // FIN INTEGRACIÓN ESP ─────────────────────
  if (!res.ok && res.status !== 409 /* ya existe */) {
    throw new Error(`ESP audiencia respondió ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

/** Helpers de respuesta JSON para las Functions. */
export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
