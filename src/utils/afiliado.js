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
 * Convierte cualquier URL de ML en tu link de afiliado.
 *
 * @param {string} url - URL de producto (con o sin parámetros previos).
 * @param {string} [campana] - Etiqueta de SECCIÓN opcional. Se añade al
 *   matt_word como `<base>_<campana>` para que en tu panel de afiliados de ML
 *   puedas medir QUÉ sección genera los clics/compras (ej. 'elegidos', 'hero',
 *   'relampago', 'menos500'). Sin campana, usa el matt_word base.
 * @returns {string}
 */
export function aLinkAfiliado(url, campana) {
  if (!url || typeof url !== 'string') return '#';
  const base = url.split('?')[0].split('#')[0].trim();
  if (!base) return '#';
  const word = campana ? `${MATT_WORD}_${String(campana).replace(/[^a-z0-9]/gi, '')}` : MATT_WORD;
  return `${base}?matt_tool=${MATT_TOOL}&matt_word=${word}`;
}
