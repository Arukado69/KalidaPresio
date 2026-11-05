// backend/email.js
// Capa de ESP (Email Service Provider) AISLADA y reemplazable. El resto del
// backend solo llama a enviarCorreo() — para cambiar de proveedor, edita SOLO
// este archivo. Default: Resend.
//
// Port de functions/_lib/email.js al backend que sí se despliega.
// Variables de entorno: RESEND_API_KEY, EMAIL_FROM.

// La marca del sitio («el tianguis honesto»): papel, tinta, cartulina
// fosforescente y rojo de sello. Los correos no cargan fuentes externas: van
// con estilos en línea y tipos del sistema, que es lo que todo cliente respeta.
const PALETA = {
  papel: '#f3ede0',
  hoja: '#fffcf4',
  tinta: '#17140f',
  suave: '#4a443a',
  tenue: '#857c6c',
  fosfo: '#e6ff2a',
  rojo: '#c21f2a',
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

/**
 * «$1,349», o con centavos si los tiene: «$99.59». Nunca redondea (un «$100»
 * por $99.59 sería un precio más alto que el real). Igual que src/utils/pesos.js.
 */
export function pesos(n) {
  const v = Number(n) || 0;
  const conCentavos = Math.round(Math.abs(v) * 100) % 100 !== 0;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: conCentavos ? 2 : 0,
    maximumFractionDigits: conCentavos ? 2 : 0,
  }).format(v);
}

/** «3 de noviembre», en la hora de la Ciudad de México. */
export function fechaMx(iso) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long' }).format(new Date(t));
}

/** «3 de noviembre, 18:30» (para la hora de fin de una relámpago). */
function fechaHoraMx(iso) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(t));
}

const estiloTexto = `font-size:15px;line-height:1.6;color:${PALETA.suave};margin:0 0 14px`;

/** Botón de cartulina fosforescente con borde de tinta. */
function boton(href, texto) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${PALETA.fosfo};color:${PALETA.tinta};font-weight:bold;text-transform:uppercase;letter-spacing:.04em;text-decoration:none;padding:13px 24px;border:2px solid ${PALETA.tinta};border-radius:999px;box-shadow:3px 3px 0 ${PALETA.tinta}">${texto}</a>`;
}

/** Envoltura común de los correos de marca. */
function plantilla(cuerpo, enlaceBaja, textoBaja = '¿Ya no quieres estos correos? <a href="{enlace}" style="color:inherit">Date de baja en un clic</a>.') {
  const pie = enlaceBaja
    ? `<p style="font-size:12px;color:${PALETA.tenue};line-height:1.5;margin:28px 0 0;border-top:1px dashed ${PALETA.tenue};padding-top:16px">
         ${textoBaja.replace('{enlace}', escapeHtml(enlaceBaja))}
       </p>`
    : '';
  return `<!doctype html><html lang="es"><body style="margin:0;background:${PALETA.papel};font-family:Arial,Helvetica,sans-serif;color:${PALETA.tinta}">
  <div style="max-width:540px;margin:0 auto;padding:28px 16px">
    <p style="margin:0 0 14px;font-family:'Arial Narrow',Arial,sans-serif;font-size:22px;font-weight:900;letter-spacing:.02em;text-transform:uppercase">Kalida<span style="color:${PALETA.rojo}">Presio</span></p>
    <div style="background:${PALETA.hoja};border:2px solid ${PALETA.tinta};padding:24px 22px">
      ${cuerpo}
      ${pie}
    </div>
  </div></body></html>`;
}

/** Correo de confirmación del doble opt-in (paso 1). */
export function correoConfirmacion(enlace) {
  return plantilla(`
    <p style="${estiloTexto}">
      Confirma tu suscripción para recibir, de vez en cuando, las mejores ofertas
      calidad-precio que detectamos. Nada de spam.
    </p>
    <p style="margin:22px 0">${boton(enlace, 'Confirmar suscripción')}</p>
    <p style="font-size:12px;color:${PALETA.tenue};line-height:1.5;margin:0">
      El enlace caduca en 24 horas. Si no solicitaste esto, ignora este correo y no pasará nada.
    </p>`);
}

/** Correo de bienvenida tras confirmar (paso 2). Ya lleva enlace de baja. */
export function correoBienvenida(enlaceBaja) {
  return plantilla(`
    <p style="${estiloTexto}">
      Listo, ya estás dentro. Te escribiremos solo cuando encontremos algo que de
      verdad valga la pena — no cada semana por costumbre.
    </p>
    <p style="${estiloTexto}">
      Recuerda: los precios que publicamos son una foto del momento en que los
      detectamos. Verifica siempre el precio final en Mercado Libre antes de comprar.
    </p>`, enlaceBaja);
}

/**
 * Confirmación de una alerta de precio (paso 1). Trae también el enlace para
 * cancelarla después: así el único correo que la persona guarda sirve para
 * las dos cosas.
 */
export function correoConfirmarAlerta({ enlace, enlaceCancelar, titulo, objetivo, precio }) {
  return plantilla(`
    <p style="${estiloTexto}">Pediste que te avisemos cuando este producto baje de <strong style="color:${PALETA.tinta}">${pesos(objetivo)}</strong>:</p>
    <p style="font-size:16px;line-height:1.45;font-weight:bold;color:${PALETA.tinta};margin:0 0 6px">${escapeHtml(titulo)}</p>
    <p style="font-size:13px;color:${PALETA.tenue};margin:0 0 18px">El último precio que vimos: ${pesos(precio)}.</p>
    <p style="margin:22px 0">${boton(enlace, 'Confirmar mi alerta')}</p>
    <p style="font-size:13px;line-height:1.55;color:${PALETA.suave};margin:0 0 10px">
      Te escribimos <strong>una sola vez</strong>: cuando lo veamos a ese precio o menos. Revisamos los
      precios a mano, así que puede tardar, y no prometemos que baje. La alerta dura 6 meses.
    </p>
    <p style="font-size:12px;color:${PALETA.tenue};line-height:1.5;margin:0">
      El enlace para confirmar caduca en 48 horas. Si no pediste esto, ignora este correo y no pasará nada.
    </p>`, enlaceCancelar, '¿Cambiaste de opinión después de confirmarla? <a href="{enlace}" style="color:inherit">Cancela la alerta en un clic</a>.');
}

/** El aviso: «¡Bajó!». Lleva el link oficial de afiliado TAL CUAL. */
export function correoBajo({ titulo, precio, objetivo, visto, enlaceMl, pagina, imagen, termina }) {
  const foto = imagen
    ? `<p style="margin:0 0 16px;text-align:center"><img src="${escapeHtml(imagen)}" alt="" width="180" style="max-width:180px;height:auto;background:#fff"></p>`
    : '';
  const relampago = termina
    ? `<p style="font-size:13px;font-weight:bold;color:${PALETA.rojo};margin:0 0 14px">Es una oferta relámpago: termina el ${escapeHtml(fechaHoraMx(termina))} (hora del centro).</p>`
    : '';
  return plantilla(`
    <p style="margin:0 0 12px"><span style="display:inline-block;border:3px solid ${PALETA.rojo};color:${PALETA.rojo};font-weight:900;text-transform:uppercase;letter-spacing:.06em;padding:4px 10px;transform:rotate(-4deg)">¡Bajó!</span></p>
    ${foto}
    <p style="font-size:16px;line-height:1.45;font-weight:bold;color:${PALETA.tinta};margin:0 0 10px">${escapeHtml(titulo)}</p>
    <p style="font-size:30px;font-weight:900;color:${PALETA.tinta};margin:0 0 4px">${pesos(precio)}</p>
    <p style="font-size:13px;color:${PALETA.suave};margin:0 0 16px">Lo vimos a ese precio el ${escapeHtml(fechaMx(visto))}. Tu alerta era de ${pesos(objetivo)}.</p>
    ${relampago}
    <p style="margin:20px 0">${boton(enlaceMl, 'Verlo en Mercado Libre')}</p>
    <p style="font-size:13px;line-height:1.55;color:${PALETA.suave};margin:0 0 10px">
      Los precios cambian rápido: <strong>confirma el precio final en Mercado Libre antes de comprar</strong>.
      <a href="${escapeHtml(pagina)}" style="color:${PALETA.tinta}">Aquí está su historial de precio</a>.
    </p>
    <p style="font-size:12px;color:${PALETA.tenue};line-height:1.5;margin:14px 0 0">
      Era una alerta de una sola vez: no te volveremos a escribir por este producto. Si quieres otra, créala en su página.
      El botón es un enlace de afiliado: si compras, KalidaPresio recibe una comisión sin costo extra para ti.
    </p>`);
}
