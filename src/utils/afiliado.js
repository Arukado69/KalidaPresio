/**
 * afiliado — Convierte CUALQUIER URL de producto de Mercado Libre en tu link
 * de afiliado, pegándole tus parámetros de tracking (matt_tool / matt_word).
 *
 * Este es el CAMINO DEL DINERO: no depende de scraping ni de la API de ML.
 * Pegas una URL, el sitio le agrega tu código, y cada clic/compra se te atribuye.
 *
 * Los valores salen del entorno (.env) con defaults públicos (estos parámetros
 * aparecen en cada enlace de afiliado, no son secretos).
 */
const MATT_TOOL = import.meta.env.ML_MATT_TOOL || '68549198';
const MATT_WORD = import.meta.env.ML_MATT_WORD || 'ci20241127172754';

/**
 * @param {string} url - URL de producto de ML (con o sin parámetros previos).
 * @returns {string} - La misma URL limpia + tus parámetros de afiliado.
 */
export function aLinkAfiliado(url) {
  if (!url || typeof url !== 'string') return '#';
  const base = url.split('?')[0].split('#')[0].trim();
  if (!base) return '#';
  return `${base}?matt_tool=${MATT_TOOL}&matt_word=${MATT_WORD}`;
}
