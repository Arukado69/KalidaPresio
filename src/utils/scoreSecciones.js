/**
 * scoreSecciones — Score K-P con pesos POR SECCIÓN.
 *
 * Decisión de negocio (2026-08-20): la componente de VOLUMEN pasó de
 * número de opiniones a UNIDADES VENDIDAS, porque ML dejó de publicarlas.
 * Mismos pesos, distinta medida. Ver `fraccionVolumen` más abajo.
 *
 * Decisión de negocio (2026-06-11):
 *   · relampago / liquidacion / menos-500 / default → 65 rating + 20 descuento + 15 volumen
 *     (la fórmula histórica de n8n, intacta).
 *   · imbatibles → 65 rating + 10 descuento + 25 volumen
 *     Los "imbatibles" son precio-permanente-bajo: ML no siempre manda
 *     previous_price, así que descuento=0 NO debe penalizar. El volumen
 *     de ventas compensa (domina el desempate), el descuento queda
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

// El descuento aporta hasta 40% (tope histórico, intacto).
const TOPE_DESCUENTO = 40;

// ── VOLUMEN: de opiniones a unidades vendidas (2026-08-20) ──────────────────
// Mercado Libre dejó de publicar el número de opiniones en las tarjetas: donde
// estaba `reviews.total` ahora hay `review_compacted`, que da UNIDADES
// VENDIDAS. El peso del volumen no cambia (15 % / 25 %); cambia qué lo mide.
// Sigue siendo prueba social objetiva y difícil de falsear — de hecho, vender
// 10.000 unidades dice más que 10.000 personas escribiendo una reseña.
//
// Por qué LOGARÍTMICO y no lineal: ML publica cubos de orden de magnitud
// (100, 500, 1000, 5mil, 10mil, 50mil, 100mil, 250mil…) y una lectura real del
// catálogo repartía así 44 productos:
//     100→3 · 500→1 · 1000→7 · 5mil→6 · 10mil→15 · 50mil→5 · 100mil→4 · 250mil→3
// Con tope lineal a 500 saturaría el 93 % del catálogo (el volumen dejaría de
// desempatar nada); con tope lineal a 250mil, casi todos quedarían cerca de 0.
// La escala log reparte el rango entero de forma útil:
//     100 → 0 %   ·   1000 → 33 %   ·   10mil → 67 %   ·   100mil → 100 %
const VENDIDOS_MIN = 100;      // suelo: por debajo, sin señal
const VENDIDOS_TOPE = 100_000; // techo: a partir de aquí, volumen pleno

/** Fracción 0–1 de la componente de volumen, en escala logarítmica. */
export function fraccionVolumen(vendidos) {
  const v = Math.max(0, Number(vendidos) || 0);
  if (v <= VENDIDOS_MIN) return 0;
  const f = (Math.log10(v) - Math.log10(VENDIDOS_MIN)) / (Math.log10(VENDIDOS_TOPE) - Math.log10(VENDIDOS_MIN));
  return Math.max(0, Math.min(f, 1));
}

/**
 * Score K-P (0–100) de un item bajo los pesos de una sección.
 * @param {{rating?: number, descuento?: number, vendidos?: number}} item
 * @param {string} seccion — 'relampago' | 'imbatibles' | 'liquidacion' | 'menos-500' | …
 * @returns {number} entero 0–100
 */
export function calcularScorePorSeccion(item, seccion) {
  return calcular(item, seccion);
}

/**
 * Score EFECTIVO con pesos estándar: respeta el `score_kalidad_presio` que ya
 * viene persistido en el feed y solo lo recalcula si falta o no es un número.
 *
 * ESTA es la única definición de la fórmula estándar en todo el proyecto.
 * Antes vivía copiada literalmente en `src/pages/index.astro` y en
 * `src/data/colecciones.js` —este último con un comentario que la llamaba
 * "Single Source of Truth", que era justo lo contrario— más una tercera
 * variante en `importarOfertas.js`. Tres copias de una regla de negocio son
 * tres oportunidades de que se separen sin que nadie lo note.
 *
 * @param {{score_kalidad_presio?: number, rating?: number, descuento?: number, vendidos?: number}} item
 * @returns {number} entero 0–100
 */
export function scoreEfectivo(item) {
  if (typeof item?.score_kalidad_presio === 'number') return item.score_kalidad_presio;
  return calcular(item, 'default');
}

function calcular(item, seccion) {
  const p = PESOS_SECCION[seccion] ?? PESOS_SECCION.default;
  const rating = Math.max(0, Math.min(item?.rating ?? 0, 5));
  const descuento = Math.max(0, Math.min(item?.descuento ?? 0, TOPE_DESCUENTO));

  const sRating = (rating / 5) * p.rating;
  const sDescuento = (descuento / TOPE_DESCUENTO) * p.descuento;
  const sVolumen = fraccionVolumen(item?.vendidos) * p.volumen;

  return Math.round(sRating + sDescuento + sVolumen);
}
