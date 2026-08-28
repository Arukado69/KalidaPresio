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
import { componerCampana } from './canales.js';

const MATT_TOOL = import.meta.env.ML_MATT_TOOL || '68549198';
const MATT_WORD = import.meta.env.ML_MATT_WORD || 'ci20241127172754';

/**
 * Convierte cualquier URL de ML en tu link de afiliado.
 *
 * @param {string} url - URL de producto (con o sin parámetros previos).
 * @param {string} [campana] - Etiqueta de SECCIÓN opcional. Se añade al
 *   matt_word para que en tu panel de afiliados de ML puedas medir QUÉ sección
 *   genera los clics/compras (ej. 'elegidos', 'hero', 'relampago', 'menos500').
 * @param {string} [canal] - Código de SUPERFICIE (ver `canales.js`). Por
 *   defecto 'wb' (el sitio). El sufijo queda `<base>_<canal><seccion>`, de modo
 *   que el panel de ML responde las dos preguntas a la vez: desde qué canal y
 *   desde qué sección se compró. Sin campana y sin canal, el matt_word sale
 *   igual que siempre (sin sufijo).
 * @returns {string}
 */
export function aLinkAfiliado(url, campana, canal) {
  if (!url || typeof url !== 'string') return '#';
  const base = url.split('?')[0].split('#')[0].trim();
  if (!base) return '#';
  const sufijo = componerCampana(campana, canal);
  const word = sufijo ? `${MATT_WORD}_${sufijo}` : MATT_WORD;
  return `${base}?matt_tool=${MATT_TOOL}&matt_word=${word}`;
}
