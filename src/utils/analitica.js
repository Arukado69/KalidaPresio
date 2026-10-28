/**
 * analitica — Lógica PURA para instrumentar los clics salientes.
 *
 * El clic que sale hacia Mercado Libre es el único evento que se traduce en
 * dinero. Todo lo demás del sitio es contexto. Estas funciones extraen, de un
 * enlace ya renderizado, los datos que hacen falta para responder «¿qué
 * SECCIÓN genera clics?».
 *
 * ANTES la sección se deducía de un sufijo pegado al `matt_word` del link
 * (`…_wbrelampago`). Ese sufijo era justamente lo que rompía la atribución en
 * Mercado Libre, así que se eliminó: ahora los links son los oficiales del
 * generador (meli.la/…, mercadolibre.com/sec/…), intactos, y la sección viaja
 * en un atributo del HTML (`data-kp-seccion`) que nunca toca el link.
 *
 * Para separar CANALES en el panel de ML, crea una etiqueta por canal en tu
 * panel de afiliados y genera el link de cada canal con su etiqueta (se guarda
 * en `enlaces` de la vitrina). Eso es lo único que ML reconoce.
 *
 * Sin dependencias y sin DOM: se puede testear entera.
 */

import { normalizarCanal, CANAL_POR_DEFECTO } from './canales.js';

/**
 * Hosts a los que sale un clic de compra: Mercado Libre México (y sus
 * subdominios) y los dos dominios de los links cortos de afiliado.
 */
const HOST_ML = /(^|\.)mercadolibre\.com(\.mx)?$|^meli\.la$/i;

/**
 * Prefijos de redirecciones propias que existieron antes. Ya no se generan,
 * pero hay enlaces viejos publicados que todavía pasan por ahí.
 */
const RUTA_CLOAK = '/recomienda/';
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
 * ¿Este enlace lleva a Mercado Libre (directo, link corto o redirección vieja)?
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
 * Id de Mercado Libre desde la URL. Cubre las formas en circulación:
 *   · catálogo   .../producto/p/MLM63172085
 *   · artículo   //articulo.mercadolibre.com.mx/MLM-2232004575-bota-...-_JM
 *   · redirecciones viejas /recomienda/MLM… y /r/tg/MLM…
 * Un link corto (meli.la/…) no lleva id: para eso está data-ml-id.
 * Devuelve siempre la forma canónica sin guion: «MLM2232004575».
 *
 * @param {string} href
 * @returns {string|null}
 */
export function idDesdeHref(href) {
  if (!href || typeof href !== 'string') return null;
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
 * `atributos` es lo que se haya podido leer del DOM (data-kp-seccion,
 * data-ml-id, data-precio, data-kp, data-cat…). Todo es opcional: si la
 * tarjeta no los trae, el evento se manda igual con lo que se pueda deducir
 * del href. Nunca lanza.
 *
 * @param {string} href
 * @param {{id?: string, precio?: any, score?: any, descuento?: any, categoria?: string, seccion?: string, canal?: string, posicion?: any}} [atributos]
 * @returns {{seccion: string, canal: string, id: string|null, precio: number|null, score: number|null, descuento: number|null, categoria: string|null, posicion: number|null, destino: string}}
 */
export function datosDelClic(href, atributos = {}) {
  const u = comoUrl(href);
  const ruta = u?.pathname ?? '';
  const canalDeRuta = ruta.startsWith(RUTA_CORTA) ? normalizarCanal(ruta.split('/')[2]) : null;

  return {
    // «sin-etiqueta» en el panel delata un CTA sin data-kp-seccion.
    seccion: atributos.seccion || 'sin-etiqueta',
    canal: canalDeRuta || (atributos.canal ? normalizarCanal(atributos.canal) : CANAL_POR_DEFECTO),
    id: atributos.id || idDesdeHref(href),
    precio: num(atributos.precio),
    score: num(atributos.score),
    descuento: num(atributos.descuento),
    categoria: atributos.categoria || null,
    posicion: num(atributos.posicion),
    destino: ruta.startsWith(RUTA_CLOAK) ? 'recomienda'
      : ruta.startsWith(RUTA_CORTA) ? 'corto'
      : u && /^meli\.la$/i.test(u.hostname) ? 'meli.la'
      : u && /\/sec\//.test(ruta) ? 'sec'
      : 'directo',
  };
}
