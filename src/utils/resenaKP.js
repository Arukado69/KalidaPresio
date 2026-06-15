/**
 * resenaKP — Derivación DETERMINISTA de la "segunda reseña" en estrellas.
 *
 * Regla de oro: cada estrella sale de un dato REAL del feed mediante una
 * función pura (mismo producto → mismo resultado, siempre). Sin Math.random,
 * sin números inventados. Si un campo falta, la función devuelve null y la
 * UI oculta esa sub-stat (degradación elegante, nunca falseo).
 *
 * Campos del feed que consume (todos existen hoy en ofertas.json):
 *   score_kalidad_presio (0–100) · rating (0–5) · opiniones (int) · descuento (%)
 */

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** Redondea a media estrella: 4.3 → 4.5, 4.2 → 4.0 */
const aMedias = (v) => Math.round(v * 2) / 2;

/**
 * Calificación global K-P en estrellas (0–5, medias).
 * Conversión directa: score 0–100 / 20. Ej: 99 → 4.95 → 5★; 88 → 4.4 → 4.5★.
 * @param {number} score100 — Sello K-P en escala 0–100.
 * @returns {number|null}
 */
export function estrellasKP(score100) {
  if (typeof score100 !== 'number' || Number.isNaN(score100)) return null;
  return aMedias(clamp(score100, 0, 100) / 20);
}

/**
 * "Calidad (compradores)": el rating REAL de Mercado Libre, ya en escala 5.
 * Solo se redondea a medias estrellas para el render. 0 o ausente → null.
 * @param {number} rating
 * @returns {number|null}
 */
export function estrellasCalidad(rating) {
  if (typeof rating !== 'number' || Number.isNaN(rating) || rating <= 0) return null;
  return aMedias(clamp(rating, 0, 5));
}

/**
 * "Respaldo (volumen)": umbrales fijos sobre el nº de opiniones.
 *   <100 → 2★ · <1,000 → 3★ · <10,000 → 4★ · ≥10,000 → 5★
 * @param {number} opiniones
 * @returns {number|null}
 */
export function estrellasRespaldo(opiniones) {
  if (typeof opiniones !== 'number' || Number.isNaN(opiniones) || opiniones < 0) return null;
  if (opiniones >= 10000) return 5;
  if (opiniones >= 1000) return 4;
  if (opiniones >= 100) return 3;
  return 2;
}

/**
 * "Ahorro real": umbrales fijos sobre el % de descuento verificado.
 *   <20% → 2★ · <40% → 3★ · <60% → 4★ · ≥60% → 5★
 * Sin descuento (0 o ausente) → null (no se muestra, no se inventa).
 * @param {number} descuento — porcentaje 0–100.
 * @returns {number|null}
 */
export function estrellasAhorro(descuento) {
  if (typeof descuento !== 'number' || Number.isNaN(descuento) || descuento <= 0) return null;
  if (descuento >= 60) return 5;
  if (descuento >= 40) return 4;
  if (descuento >= 20) return 3;
  return 2;
}

/**
 * Arma la reseña completa de una oferta. `scoreOverride` permite pasar el
 * score ya normalizado (score100) que calculan las páginas; si no, usa el
 * del feed. Devuelve null si ni siquiera hay score global.
 * @param {object} oferta — item de ofertas.json
 * @param {number} [scoreOverride]
 * @returns {{ global: number, subs: Array<{label: string, estrellas: number}> } | null}
 */
export function resenaKP(oferta, scoreOverride) {
  const global = estrellasKP(scoreOverride ?? oferta?.score_kalidad_presio);
  if (global === null) return null;
  const subs = [
    ['Calidad (compradores)', estrellasCalidad(oferta?.rating)],
    // "Recomendación masiva": el volumen de opiniones dicho como beneficio
    // real al comprador ("miles ya lo compraron") en vez de jerga corporativa.
    ['Recomendación masiva', estrellasRespaldo(oferta?.opiniones)],
    ['Ahorro real', estrellasAhorro(oferta?.descuento)],
  ]
    .filter(([, v]) => v !== null)
    .map(([label, estrellas]) => ({ label, estrellas }));
  return { global, subs };
}
