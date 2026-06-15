// src/utils/veredicto.js
// Genera un "veredicto editorial" (estilo Wirecutter) de forma DETERMINISTA
// a partir de señales reales del feed. Nunca inventa datos; degrada con elegancia.

/** Tier del Sello K-P (mismo corte que SelloKP.astro). */
export function tierKP(score) {
  const s = Number(score) || 0;
  return s >= 90 ? 'Excepcional'
    : s >= 80 ? 'Excelente'
    : s >= 70 ? 'Buena'
    : s >= 55 ? 'Aceptable'
    : 'Baja';
}

/** Formatea el volumen de opiniones de forma legible (1 200 → "1.2 mil"). */
function opiniones(n) {
  const v = Number(n) || 0;
  if (v >= 1000) {
    const miles = v / 1000;
    return `${miles >= 10 ? Math.round(miles) : miles.toFixed(1)} mil`;
  }
  return v.toLocaleString('es-MX');
}

/**
 * Veredicto en 1-2 frases. Elige el ángulo MÁS fuerte como apertura
 * y cierra con la señal de confianza (vendedor / envío).
 * @param {object} o - oferta del feed
 * @returns {string}
 */
export function generarVeredicto(o = {}) {
  const r = Number(o.rating) || 0;
  const op = Number(o.opiniones) || 0;
  const d = Math.round(Number(o.descuento) || 0);
  const opTxt = opiniones(op);
  const frases = [];

  // ── Apertura: la señal más contundente manda ──
  if (o.mas_vendido && r >= 4.5 && op > 0) {
    frases.push(`De lo más vendido de su categoría y aun así ${r.toFixed(1)}★ con ${opTxt} opiniones.`);
  } else if (d >= 50 && r >= 4.5 && op > 0) {
    frases.push(`Baja ${d}% real y mantiene ${r.toFixed(1)}★ entre ${opTxt} compradores.`);
  } else if (r >= 4.7 && op >= 500) {
    frases.push(`${r.toFixed(1)}★ con ${opTxt} opiniones: calidad probada por mucha gente.`);
  } else if (d >= 40) {
    frases.push(`Descuento real del ${d}% verificado contra su precio habitual${r > 0 ? `, con ${r.toFixed(1)}★` : ''}.`);
  } else if (r > 0 && op > 0) {
    frases.push(`${r.toFixed(1)}★ con ${opTxt} opiniones${d > 0 ? ` y ${d}% de descuento real` : ''}.`);
  } else if (d > 0) {
    frases.push(`Descuento real del ${d}% sobre su precio habitual.`);
  } else {
    frases.push('Oferta activa en Mercado Libre con buena valoración.');
  }

  // ── Cierre de confianza ──
  if (o.vendedor_confiable && o.envio_gratis) frases.push('Vendedor reputado y envío gratis.');
  else if (o.vendedor_confiable) frases.push('De un vendedor reputado.');
  else if (o.envio_gratis) frases.push('Con envío gratis.');

  return frases.join(' ');
}
