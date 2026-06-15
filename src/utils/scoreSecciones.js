/**
 * scoreSecciones — Score K-P con pesos POR SECCIÓN.
 *
 * Decisión de negocio (2026-06-11):
 *   · relampago / liquidacion / menos-500 / default → 65 rating + 20 descuento + 15 volumen
 *     (la fórmula histórica de n8n, intacta).
 *   · imbatibles → 65 rating + 10 descuento + 25 volumen
 *     Los "imbatibles" son precio-permanente-bajo: ML no siempre manda
 *     previous_price, así que descuento=0 NO debe penalizar. El volumen
 *     de opiniones compensa (domina el desempate), el descuento queda
 *     como apoyo.
 *
 * Función PURA y determinista: mismo item + misma sección → mismo score.
 * El campo persistido en JSON sigue siendo el score global (un solo campo);
 * este recalibrado se calcula en build-time al montar cada colección.
 */

/** Pesos por sección. Cualquier sección no listada usa `default`. */
export const PESOS_SECCION = {
  default:    { rating: 65, descuento: 20, volumen: 15 },
  imbatibles: { rating: 65, descuento: 10, volumen: 25 },
};

// Topes de la fórmula histórica (idénticos a importarOfertas.js / n8n):
// el descuento aporta hasta 40% y el volumen satura a 500 opiniones.
const TOPE_DESCUENTO = 40;
const TOPE_OPINIONES = 500;

/**
 * Score K-P (0–100) de un item bajo los pesos de una sección.
 * @param {{rating?: number, descuento?: number, opiniones?: number}} item
 * @param {string} seccion — 'relampago' | 'imbatibles' | 'liquidacion' | 'menos-500' | …
 * @returns {number} entero 0–100
 */
export function calcularScorePorSeccion(item, seccion) {
  const p = PESOS_SECCION[seccion] ?? PESOS_SECCION.default;
  const rating = Math.max(0, Math.min(item?.rating ?? 0, 5));
  const descuento = Math.max(0, Math.min(item?.descuento ?? 0, TOPE_DESCUENTO));
  const opiniones = Math.max(0, item?.opiniones ?? 0);

  const sRating = (rating / 5) * p.rating;
  const sDescuento = (descuento / TOPE_DESCUENTO) * p.descuento;
  const sVolumen = Math.min(opiniones / TOPE_OPINIONES, 1) * p.volumen;

  return Math.round(sRating + sDescuento + sVolumen);
}
