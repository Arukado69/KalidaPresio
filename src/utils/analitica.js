/**
 * analitica — Lógica PURA para instrumentar los clics salientes.
 *
 * El clic que sale hacia Mercado Libre es el único evento que se traduce en
 * dinero. Todo lo demás del sitio es contexto. Estas funciones extraen, de un
 * enlace ya renderizado, los datos que hacen falta para responder «¿qué sección
 * genera clics?» sin añadir ni un atributo nuevo al HTML.
 *
 * La clave: la sección se deduce del sufijo de `matt_word`, que `aLinkAfiliado`
 * ya inyecta en cada enlace. Así la etiqueta que ves en Umami es LITERALMENTE
 * la misma que ves en el panel de afiliados de Mercado Libre, y las dos mitades
 * del embudo —clics propios y comisiones de ML— se pueden cruzar sin adivinar.
 *
 * Sin dependencias y sin DOM: se puede testear entera.
 */

/** Host de Mercado Libre México (y sus subdominios: articulo., www., …). */
const HOST_ML = /(^|\.)mercadolibre\.com\.mx$/i;

/** Prefijo del cloaking propio, que redirige 302 a ML. */
const RUTA_CLOAK = '/recomienda/';

/**
 * ¿Este enlace lleva a Mercado Libre (directo o vía /recomienda/)?
 * @param {string} href
 * @param {string} [origenActual] - origin del sitio, para resolver relativas.
 * @returns {boolean}
 */
export function esEnlaceSaliente(href, origenActual = 'https://kalidapresio.albis-labs.xyz') {
  if (!href || typeof href !== 'string') return false;
  let u;
  try {
    u = new URL(href, origenActual);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (HOST_ML.test(u.hostname)) return true;
  return u.pathname.startsWith(RUTA_CLOAK);
}

/**
 * Sección desde el sufijo de `matt_word`.
 *
 * `aLinkAfiliado` compone `<base>_<campana>` y sanea la campaña a
 * alfanuméricos, así que la campaña NUNCA contiene «_». Por eso se corta por
 * el ÚLTIMO guion bajo: aunque el matt_word base tuviera uno, la campaña sale
 * intacta.
 *
 * @param {string} href
 * @returns {string|null} la campaña, o null si el enlace no la lleva.
 */
export function seccionDesdeHref(href) {
  if (!href || typeof href !== 'string') return null;
  let word;
  try {
    word = new URL(href, 'https://kalidapresio.albis-labs.xyz').searchParams.get('matt_word');
  } catch {
    return null;
  }
  if (!word) return null;
  const i = word.lastIndexOf('_');
  if (i === -1) return null;
  const campana = word.slice(i + 1);
  return campana || null;
}

/**
 * Id de Mercado Libre desde la URL. Cubre las tres formas que produce el feed:
 *   · catálogo   .../producto/p/MLM63172085
 *   · artículo   //articulo.mercadolibre.com.mx/MLM-2232004575-bota-...-_JM
 *   · cloaking   /recomienda/MLM4568402546
 * Devuelve siempre la forma canónica sin guion: «MLM2232004575».
 *
 * @param {string} href
 * @returns {string|null}
 */
export function idDesdeHref(href) {
  if (!href || typeof href !== 'string') return null;
  // Fuera la query: `matt_word` y compañía traen dígitos que despistarían.
  const sinQuery = href.split('?')[0].split('#')[0];
  const m = sinQuery.match(/ML[A-Z]-?(\d{6,})/i);
  if (!m) return null;
  return `${m[0].slice(0, 3).toUpperCase()}${m[1]}`;
}

/** Convierte a número, o null si no lo es (Umami distingue número de texto). */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reúne los datos de un clic saliente.
 *
 * `atributos` es lo que se haya podido leer del DOM (data-ml-id, data-precio,
 * data-kp, data-cat…). Todo es opcional: si la tarjeta no los trae, el evento
 * se manda igual con lo que se pueda deducir del href. Nunca lanza.
 *
 * @param {string} href
 * @param {{id?: string, precio?: any, score?: any, descuento?: any, categoria?: string, seccion?: string, posicion?: any}} [atributos]
 * @returns {{seccion: string, id: string|null, precio: number|null, score: number|null, descuento: number|null, categoria: string|null, posicion: number|null, destino: string}}
 */
export function datosDelClic(href, atributos = {}) {
  return {
    // Prioridad: matt_word (coincide con el panel de ML) → marca explícita del
    // DOM → «sin-etiqueta», que en el panel delata un CTA sin instrumentar.
    seccion: seccionDesdeHref(href) || atributos.seccion || 'sin-etiqueta',
    id: atributos.id || idDesdeHref(href),
    precio: num(atributos.precio),
    score: num(atributos.score),
    descuento: num(atributos.descuento),
    categoria: atributos.categoria || null,
    posicion: num(atributos.posicion),
    // Distingue el clic directo del que pasa por el cloaking propio.
    destino: href.includes(RUTA_CLOAK) ? 'recomienda' : 'directo',
  };
}
