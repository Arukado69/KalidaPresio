/**
 * vitrina — Los productos que recomiendas, con TU link oficial de afiliado.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * El sitio armaba los links de afiliado a mano: tomaba la URL del producto y
 * le pegaba `?matt_tool=…&matt_word=…`. Mercado Libre no documenta que eso
 * funcione, sus términos piden publicar el link del generador sin editarlo, y
 * en la práctica una compra hecha por uno de esos links no generó comisión.
 * Además, desde el 8 de octubre de 2026 Mercado Libre bloquea a los servidores
 * (GitHub, el VPS) con una pantalla de «verifica tu cuenta», así que el
 * catálogo que se raspaba solo dejó de existir.
 *
 * La vitrina resuelve las dos cosas con la misma regla: aquí solo entra lo que
 * TÚ elegiste, con el link que TÚ generaste en tu panel de afiliados. Ningún
 * enlace del sitio se construye ni se modifica: se publica tal cual.
 *
 * ── LA FORMA DE UNA ENTRADA (src/data/vitrina.json) ────────────────────────
 *   {
 *     "link":         "https://meli.la/1AbCdE",   ← OBLIGATORIO, sin editar
 *     "titulo":       "Hidrolavadora eléctrica 1600 PSI",
 *     "precio":       869,
 *     "precio_antes": 2299,                       ← opcional
 *     "revisado":     "2026-10-26T14:00:00-06:00", ← cuándo viste ese precio
 *     "imagen":       "https://http2.mlstatic.com/…",
 *     "url_producto": "https://www.mercadolibre.com.mx/…/p/MLM53177027",
 *     "id_articulo":  "MLM1932698151",             ← lo llena el marcador
 *     "rating": 4.8, "vendidos": 250000, "envio_gratis": true,
 *     "relampago": true, "termina": "2026-10-26T23:00:00-06:00",
 *     "destacado": true,                          ← sale en «Elegidos»
 *     "nota": "Lo uso para lavar el coche",
 *     "enlaces": { "wa": "https://meli.la/…", "tg": "https://meli.la/…" }
 *   }
 *
 * Lo normal es no escribir esto a mano: /panel/agregar lo arma desde la página
 * del producto con un marcador del navegador.
 *
 * Función PURA: mismo archivo + mismo instante → mismo resultado. Sin disco.
 */
import { calcularScorePorSeccion, fraccionVolumen } from './scoreSecciones.js';
import { esCanal } from './canales.js';

const HORA = 3_600_000;
const DIA = 24 * HORA;

/**
 * Un precio que nadie ha mirado en una semana ya no es una recomendación, es
 * una suposición. Pasado este plazo la entrada se esconde hasta que vuelvas a
 * revisarla (el panel te la marca).
 */
export const DIAS_VIGENCIA_PRECIO = 7;

/**
 * Una relámpago sin hora de fin conocida se retira sola pasado este tiempo
 * desde que la viste. NO se muestra como cuenta regresiva: inventar una hora de
 * fin sería mentir; esto solo evita anunciar una que casi seguro ya terminó.
 */
export const HORAS_RELAMPAGO_SIN_FIN = 12;

/**
 * ¿Es un link corto oficial del generador de afiliados?
 *
 * Solo se aceptan las dos formas cortas que entrega Mercado Libre:
 *   · https://meli.la/<código>
 *   · https://mercadolibre.com/sec/<código>  (o mercadolibre.com.mx/sec/…)
 *
 * Una URL de producto con `matt_tool`/`matt_word` NO se acepta aunque «se vea»
 * de afiliado: es exactamente la forma de los links armados a mano que no
 * generaron comisión, y desde aquí no hay manera de distinguir uno generado de
 * uno inventado. El generador siempre ofrece la versión corta: usa esa.
 *
 * @param {any} valor
 * @returns {boolean}
 */
export function esLinkOficial(valor) {
  if (typeof valor !== 'string') return false;
  const s = valor.trim();
  if (!s || /\s/.test(s)) return false;
  let u;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'meli.la') return /^\/[A-Za-z0-9_-]{4,}\/?$/.test(u.pathname);
  if (host === 'mercadolibre.com' || host === 'mercadolibre.com.mx') {
    return /^\/sec\/[A-Za-z0-9_-]{4,}\/?$/.test(u.pathname);
  }
  return false;
}

/**
 * Id de Mercado Libre de una URL de producto, en forma canónica («MLM123…»).
 * Prefiere el de catálogo (`/p/MLM…`), que es el estable: el de artículo cambia
 * cuando cambia el vendedor que gana la ficha.
 *
 * @param {any} url
 * @returns {string|null}
 */
export function claveProducto(url) {
  if (typeof url !== 'string') return null;
  const sinQuery = url.split(/[?#]/)[0];
  const catalogo = sinQuery.match(/\/p\/(ML[A-Z])(\d{6,})/i);
  if (catalogo) return catalogo[1].toUpperCase() + catalogo[2];
  const articulo = sinQuery.match(/(ML[A-Z])-?(\d{6,})/i);
  return articulo ? articulo[1].toUpperCase() + articulo[2] : null;
}

/** «MLM-1932698151», « mlm1932698151 » → «MLM1932698151». null si no es un id de ML. */
function normalizarIdMl(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toUpperCase().replace(/^(ML[A-Z])-/, '$1');
  return /^ML[A-Z]\d{6,}$/.test(s) ? s : null;
}

/**
 * Id de ARTÍCULO (la publicación de un vendedor) que trae una URL, o null.
 *
 * En una ficha de catálogo (`/p/MLM…`) el artículo que gana la ficha viaja en
 * los parámetros: `wid=MLM…` o `pdp_filters=item_id:MLM…`. En una URL de
 * artículo (`/MLM-123…`) es el propio id de la ruta. Una ficha de catálogo sin
 * esos parámetros NO lo trae: devolver el de catálogo aquí sería mezclar las
 * dos claves que esta función existe para separar.
 *
 * @param {any} url
 * @returns {string|null}
 */
export function idArticulo(url) {
  if (typeof url !== 'string') return null;
  let s = url;
  try {
    s = decodeURIComponent(url);
  } catch { /* se lee tal cual */ }
  // `[?&#=,]` antes de item_id: que `parent_item_id=` no cuente como el suyo.
  const param = s.match(/(?:[?&#]wid=|[?&#=,]item_id[:=])(ML[A-Z])-?(\d{6,})/i);
  if (param) return param[1].toUpperCase() + param[2];
  const ruta = s.split(/[?#]/)[0];
  if (/\/p\/ML[A-Z]\d/i.test(ruta)) return null;
  const articulo = ruta.match(/(ML[A-Z])-?(\d{6,})/i);
  return articulo ? articulo[1].toUpperCase() + articulo[2] : null;
}

/**
 * Con qué claves se guarda una observación del listado de ofertas: el id de la
 * tarjeta (artículo) y, si la tarjeta es de una ficha de catálogo, también el
 * de catálogo. El de catálogo es el que usa la vitrina, y el que NO cambia
 * cuando cambia el vendedor que gana la ficha.
 *
 * @param {any} id — id de la tarjeta
 * @param {any} url — URL del producto
 * @returns {string[]}
 */
export function clavesObservacion(id, url) {
  return [...new Set([normalizarIdMl(id), claveProducto(url)].filter(Boolean))];
}

/**
 * URL del producto en Mercado Libre México, sin query ni ancla. Sirve para
 * abrir la ficha (y generar ahí el link), nunca como enlace de compra.
 *
 * @param {any} url
 * @returns {string|null}
 */
export function urlProductoLimpia(url) {
  if (typeof url !== 'string') return null;
  let u;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!/(^|\.)mercadolibre\.com\.mx$/i.test(u.hostname)) return null;
  return `https://${u.hostname.toLowerCase()}${u.pathname}`;
}

/** Id para una entrada sin URL de producto: sale del código del link corto. */
function idDesdeLink(link) {
  const codigo = new URL(link.trim()).pathname.split('/').filter(Boolean).pop();
  return `kp-${codigo}`;
}

/** Número desde número o texto («$1,299», «869»). null si no hay número. */
function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const limpio = v.replace(/[^\d.]/g, '');
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function texto(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Convierte una entrada de vitrina.json al shape canónico de oferta que ya usa
 * todo el sitio (TarjetaOferta, colecciones, feed.json…), o explica por qué no
 * se puede publicar.
 *
 * @param {object} entrada
 * @param {number} [ahora]
 * @returns {{producto: object, avisos: string[]} | {motivo: string}}
 */
export function normalizarProducto(entrada, ahora = Date.now()) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};

  if (!e.link) return { motivo: 'falta el link oficial' };
  if (!esLinkOficial(e.link)) {
    return { motivo: 'el link no es un link corto oficial (meli.la/… o mercadolibre.com/sec/…)' };
  }

  const titulo = texto(e.titulo);
  if (!titulo) return { motivo: 'falta el título' };

  const precio = numero(e.precio);
  if (!(precio > 0)) return { motivo: 'falta el precio' };

  const revisadoMs = Date.parse(e.revisado ?? '');
  if (Number.isNaN(revisadoMs)) return { motivo: 'falta «revisado» (la fecha en que viste el precio)' };
  if (ahora - revisadoMs > DIAS_VIGENCIA_PRECIO * DIA) {
    return { motivo: `el precio lleva más de ${DIAS_VIGENCIA_PRECIO} días sin revisarse` };
  }

  const relampago = e.relampago === true;
  let termina = null;
  let caduca = null;
  if (relampago) {
    const t = Date.parse(e.termina ?? '');
    termina = Number.isNaN(t) ? null : new Date(t).toISOString();
    caduca = termina ?? new Date(revisadoMs + HORAS_RELAMPAGO_SIN_FIN * HORA).toISOString();
    if (Date.parse(caduca) <= ahora) return { motivo: 'la oferta relámpago ya terminó' };
  }

  const avisos = [];
  const enlaces = {};
  if (e.enlaces && typeof e.enlaces === 'object') {
    for (const [canal, link] of Object.entries(e.enlaces)) {
      if (!esCanal(canal)) avisos.push(`canal desconocido en enlaces: «${canal}»`);
      else if (!esLinkOficial(link)) avisos.push(`el link de «${canal}» no es un link corto oficial`);
      else enlaces[canal] = link.trim();
    }
  }

  const previo = numero(e.precio_antes);
  const precioPrevio = previo !== null && previo > precio ? previo : null;
  const descuento = precioPrevio ? Math.round((1 - precio / precioPrevio) * 100) : 0;
  const rating = Math.min(Math.max(numero(e.rating) ?? 0, 0), 5);
  const vendidos = Math.max(numero(e.vendidos) ?? 0, 0);
  const urlProducto = urlProductoLimpia(e.url_producto);
  const vendedorConfiable = e.vendedor_confiable === true;
  const destacado = e.destacado === true ? 'Elegido' : texto(e.destacado);
  const id = claveProducto(urlProducto) ?? idDesdeLink(e.link);

  // El histórico de precios se llenó con ids de ARTÍCULO (lo que trae cada
  // tarjeta del listado) y la vitrina identifica por CATÁLOGO (/p/MLM…). Sin
  // buscar con las dos, ningún producto encontraba su historia y el veredicto
  // salía siempre «sin datos»: ni «No publicar hoy» ni el descuento falso.
  const declarado = normalizarIdMl(e.id_articulo);
  if (texto(e.id_articulo) && !declarado) {
    avisos.push(`«id_articulo» no es un id de Mercado Libre (MLM…): ${e.id_articulo}`);
  }
  const articulo = declarado ?? idArticulo(e.url_producto);

  return {
    producto: {
      id,
      id_articulo: articulo,
      claves_historico: [...new Set([id, articulo].filter(Boolean))],
      titulo,
      precio_actual: precio,
      precio_previo: precioPrevio,
      descuento,
      rating,
      vendidos,
      // Se llama igual que antes para que los componentes no cambien, pero ya
      // no es un link armado: es el link oficial, exactamente como se pegó.
      link_afiliado: e.link.trim(),
      enlaces,
      imagen: texto(e.imagen),
      url_producto: urlProducto,
      envio_gratis: e.envio_gratis === true,
      cupon: texto(e.cupon),
      vendedor: null,
      vendedor_confiable: vendedorConfiable,
      oferta_relampago: relampago,
      fin_oferta: termina,
      relampago_fin: termina,
      caduca,
      destacado,
      nota: texto(e.nota),
      revisado: new Date(revisadoMs).toISOString(),
      score_kalidad_presio: calcularScorePorSeccion({ rating, descuento, vendidos }, 'default'),
      // Misma receta que importarOfertas.js: volumen 60 % · vendedor reputado 40 %.
      confianza: Math.round(Math.min(fraccionVolumen(vendidos) * 60 + (vendedorConfiable ? 40 : 0), 100)),
    },
    avisos,
  };
}

/**
 * Lee la vitrina entera. Acepta `{ productos: [...] }` o un array pelón.
 *
 * Lo que no se puede publicar NO rompe el build: se aparta con su motivo,
 * para que el build lo anuncie y el panel te diga qué arreglar.
 *
 * @param {any} crudo
 * @param {number} [ahora]
 * @returns {{productos: object[], descartes: {indice: number, titulo: string|null, motivo: string}[], avisos: string[]}}
 */
export function cargarVitrina(crudo, ahora = Date.now()) {
  const lista = Array.isArray(crudo) ? crudo : (Array.isArray(crudo?.productos) ? crudo.productos : []);
  const productos = [];
  const descartes = [];
  const avisos = [];
  const vistos = new Set();

  lista.forEach((entrada, indice) => {
    const r = normalizarProducto(entrada, ahora);
    const titulo = texto(entrada?.titulo);
    if ('motivo' in r) {
      descartes.push({ indice, titulo, motivo: r.motivo });
      return;
    }
    if (vistos.has(r.producto.id)) {
      descartes.push({ indice, titulo, motivo: `producto repetido (${r.producto.id})` });
      return;
    }
    vistos.add(r.producto.id);
    productos.push(r.producto);
    for (const a of r.avisos) avisos.push(`${titulo}: ${a}`);
  });

  return { productos, descartes, avisos };
}

/**
 * El link que toca publicar en un canal: el de su etiqueta si lo generaste,
 * si no, el general. Nunca se arma uno nuevo.
 *
 * @param {{link_afiliado: string, enlaces?: Record<string, string>}} producto
 * @param {string} [canal]
 * @returns {string}
 */
export function enlacePara(producto, canal) {
  return (canal && producto?.enlaces?.[canal]) || producto?.link_afiliado;
}

/**
 * La revisión de precio MÁS VIEJA entre los productos dados (ISO), o null.
 *
 * Es la que se anuncia en el sitio: si un precio tiene cinco días, decir
 * «revisados hace 2 horas» porque otro es de hoy sería esconder la edad real.
 *
 * @param {{revisado?: string}[]} productos
 * @returns {string|null}
 */
export function revisionMasVieja(productos) {
  let min = Infinity;
  for (const p of productos ?? []) {
    const t = Date.parse(p?.revisado ?? '');
    if (!Number.isNaN(t) && t < min) min = t;
  }
  return Number.isFinite(min) ? new Date(min).toISOString() : null;
}

/**
 * El orden en que se publica (y se numera en /hoy): primero las relámpago que
 * terminan antes, luego los destacados, luego el resto por Sello K-P.
 *
 * El número de cada producto en /hoy es su posición en esta lista. Un video
 * que dice «el #3 está en mi perfil» depende de que el panel y la página
 * cuenten igual, por eso el orden vive aquí y no en cada página.
 *
 * @param {object[]} productos
 * @returns {object[]} copia ordenada
 */
export function ordenParaPublicar(productos) {
  const fin = (p) => Date.parse(p.caduca ?? '') || Infinity;
  return [...(productos ?? [])].sort((a, b) =>
    Number(b.oferta_relampago) - Number(a.oferta_relampago)
    || (a.oferta_relampago ? fin(a) - fin(b) : 0)
    || Number(Boolean(b.destacado)) - Number(Boolean(a.destacado))
    || (b.score_kalidad_presio ?? 0) - (a.score_kalidad_presio ?? 0)
    || (b.descuento ?? 0) - (a.descuento ?? 0));
}
