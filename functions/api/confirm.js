// functions/api/confirm.js  →  GET /api/confirm?token=...
// Paso 2 del doble opt-in: valida la firma + expiración del token; si es válido,
// añade el email a la audiencia del ESP y muestra una página de confirmación.

import { verificarToken } from '../_lib/token.js';
import { confirmarEnAudiencia } from '../_lib/email.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';

  if (!env?.SUBSCRIBE_SECRET) {
    console.error('[boletín] Falta SUBSCRIBE_SECRET en el entorno.');
    return pagina('Configuración incompleta', 'No podemos confirmar ahora mismo. Intenta más tarde.', false, 500);
  }

  const r = await verificarToken(token, env.SUBSCRIBE_SECRET);
  if (!r.ok) {
    const msg = r.error === 'expirado'
      ? 'Este enlace de confirmación caducó (válido 24 h). Vuelve a suscribirte para recibir uno nuevo.'
      : 'Este enlace de confirmación no es válido.';
    return pagina('Enlace no válido', msg, false, 400);
  }

  // Firma válida → alta en la audiencia del ESP (aislado, // INTEGRACIÓN ESP).
  // No bloqueante: si el alta falla, la confirmación criptográfica ya es válida.
  try {
    await confirmarEnAudiencia({ email: r.email, env });
  } catch (e) {
    console.error('[boletín] confirmado pero no se pudo añadir a la audiencia:', e);
  }

  return pagina('¡Suscripción confirmada! 🎉', `Listo, <strong>${escapeHtml(r.email)}</strong> quedó suscrito. Te escribiremos solo cuando encontremos algo que de verdad valga la pena.`, true, 200);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Página HTML mínima con el design system (tokens inline para no depender del CSS del sitio).
function pagina(titulo, mensaje, ok, status) {
  const acento = ok ? '#1fd28e' : '#ff5d76';
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo} — KalidaPresio</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#140e1f;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#f0eef8">
  <main style="max-width:480px;padding:40px 28px;text-align:center">
    <div style="font-size:34px;font-weight:800;color:${acento};margin-bottom:6px">KalidaPresio</div>
    <h1 style="font-size:22px;margin:0 0 12px">${titulo}</h1>
    <p style="font-size:15px;line-height:1.6;color:#c9c3e0;margin:0 0 28px">${mensaje}</p>
    <a href="/" style="display:inline-block;background:${acento};color:#0b231a;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:10px">Ir al inicio</a>
  </main>
</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
