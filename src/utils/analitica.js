/**
 * analitica — Lógica PURA para instrumentar los clics salientes.
 *
 * El clic que sale hacia Mercado Libre es el único evento que se traduce en
 * dinero. Todo lo demás del sitio es contexto. Estas funciones extraen, de un
 * enlace ya renderizado, los datos que hacen falta para responder «¿qué CANAL y
 * qué SECCIÓN generan clics?» sin añadir ni un atributo nuevo al HTML.
 *
 * La clave: las dos se deducen del sufijo de `matt_word`, que `aLinkAfiliado`
 * ya inyecta en cada enlace (`<base>_<canal><seccion>`). Así la etiqueta que ves
 * en Umami es LITERALMENTE la misma que ves en el panel de afiliados de Mercado
 * Libre, y las dos mitades del embudo —clics propios y comisiones de ML— se
 * pueden cruzar sin adivinar.
 *
 * El canal importa desde que la misma oferta se publica en varios lados: sin
 * él, el panel de ML mezcla Telegram, WhatsApp y el sitio en una sola fila y no
 * hay forma de saber cuál mantener.
 *
 * Sin dependencias y sin DOM: se puede testear entera.
 */

import { partirCampana, normalizarCanal, CANAL_POR_DEFECTO } from './canales.js';

/** Host de Mercado Libre México (y sus subdominios: articulo., www., …). */
const HOST_ML = /(^|\.)mercadolibre\.com\.mx$/i;

/** Prefijo del cloaking propio, que redirige 302 a ML. */
const RUTA_CLOAK = '/recomienda/';

/**
 * Prefijo del enlace corto POR CANAL: /r/<canal>/<id>. Es el que se comparte
 * fuera del sitio, así que sobrevive a que la oferta salga del feed (lo
 * resuelve el backend contra su propia tabla, no el build).
 */
const RUTA_CORTA = '/r/';

const ORIGEN_POR_DEFECTO = 'https://kalidapresio.albis-labs.xyz';

/** Resuelve el href a URL, o null si no es utilizable. Nunca lanza. */
function comoUrl(href, origenActual = ORIGEN_POR_DEFECTO) {
  if (!href || typeof href !== 'string') return null;
  try {
    return new URL(href, origenActual);
  } catch {
    return null;
  }
}

/**
 * ¿Este enlace lleva a Mercado Libre (directo, vía /recomienda/ o vía /r/)?
 * @param {string} href
 * @param {string} [origenActual] - origin del sitio, para resolver relativas.
 * @returns {boolean}
 */
export function esEnlaceSaliente(href, origenActual = ORIGEN_POR_DEFECTO) {
  const u = comoUrl(href, origenActual);
  if (!u) return false;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (HOST_ML.test(u.hostname)) return true;
  return u.pathname.startsWith(RUTA_CLOAK) || u.pathname.startsWith(RUTA_CORTA);
}

/**
 * El sufijo crudo de `matt_word` — lo que va después del último «_».
 *
 * `aLinkAfiliado` compone `<base>_<canal><seccion>` y sanea la sección a
 * alfanuméricos, así que el sufijo NUNCA contiene «_». Por eso se corta por
 * el ÚLTIMO guion bajo: aunque el matt_word base tuviera uno, el sufijo sale
 * intacto.
 *
 * @param {string} href
 * @returns {string|null}
 */
function sufijoDesdeHref(href) {
  const u = comoUrl(href);
  const word = u?.searchParams.get('matt_word');
  if (!word) return null;
  const i = word.lastIndexOf('_');
  if (i === -1) return null;
  return word.slice(i + 1) || null;
}

/**
 * Sección desde el sufijo de `matt_word`, ya sin el código de canal.
 *
 * @param {string} href
 * @returns {string|null} la sección, o null si el enlace no la lleva.
 */
export function seccionDesdeHref(href) {
  const sufijo = sufijoDesdeHref(href);
  return sufijo === null ? null : partirCampana(sufijo).seccion;
}

/**
 * Canal (superficie) desde el sufijo de `matt_word`.
 *
 * Un enlace sin sufijo es del sitio por definición: hasta que existieron los
 * canales, el sitio era lo único que había. Por eso el default no es null.
 *
 * @param {string} href
 * @returns {string} código de canal (ver `canales.js`).
 */
export function canalDesdeHref(href) {
  const sufijo = sufijoDesdeHref(href);
  return sufijo === null ? CANAL_POR_DEFECTO : partirCampana(sufijo).canal;
}

/**
 * Id de Mercado Libre desde la URL. Cubre las cuatro formas en circulación:
 *   · catálogo   .../producto/p/MLM63172085
 *   · artículo   //articulo.mercadolibre.com.mx/MLM-2232004575-bota-...-_JM
 *   · cloaking   /recomienda/MLM4568402546
 *   · corto      /r/tg/MLM4568402546
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
 * @returns {{seccion: string, canal: string, id: string|null, precio: number|null, score: number|null, descuento: number|null, categoria: string|null, posicion: number|null, destino: string}}
 */
export function datosDelClic(href, atributos = {}) {
  const u = comoUrl(href);
  const ruta = u?.pathname ?? '';
  // El enlace corto no lleva matt_word: el canal viaja en la propia ruta y el
  // backend lo estampa al redirigir. Aquí se lee de donde esté.
  const canalDeRuta = ruta.startsWith(RUTA_CORTA) ? normalizarCanal(ruta.split('/')[2]) : null;

  return {
    // Prioridad: matt_word (coincide con el panel de ML) → marca explícita del
    // DOM → «sin-etiqueta», que en el panel delata un CTA sin instrumentar.
    seccion: seccionDesdeHref(href) || atributos.seccion || 'sin-etiqueta',
    canal: canalDeRuta || canalDesdeHref(href),
    id: atributos.id || idDesdeHref(href),
    precio: num(atributos.precio),
    score: num(atributos.score),
    descuento: num(atributos.descuento),
    categoria: atributos.categoria || null,
    posicion: num(atributos.posicion),
    // Distingue el clic directo del que pasa por una redirección propia.
    destino: ruta.startsWith(RUTA_CLOAK) ? 'recomienda'
      : ruta.startsWith(RUTA_CORTA) ? 'corto'
      : 'directo',
  };
}
