/**
 * detector — El Detector de descuentos del Buen Fin: qué se puede decir de
 * cada producto en oferta con el historial observado.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * La promesa de la marca es «te digo cuándo el descuento es mentira», y el
 * Buen Fin es cuando más se pone a prueba: precios que suben antes para
 * «rebajarse» después. El histórico ya sabía decirlo producto por producto
 * (src/utils/historico.js); esto lo aplica a todo lo que está en oferta hoy
 * para publicarlo en /buen-fin.
 *
 * ── DE DÓNDE SALE CADA COSA ────────────────────────────────────────────────
 *   · historico-precios.json  → [fecha, mín, máx] por clave (artículo y catálogo)
 *   · catalogo-observado.json → la FICHA de cada artículo visto en /ofertas:
 *     título, URL, foto, precio y descuento anunciado. El histórico solo guarda
 *     números; sin ficha no hay a quién ponerle el veredicto.
 * Las dos las escribe el observador diario (npm run observar-diario).
 *
 * ── LA REGLA ───────────────────────────────────────────────────────────────
 * Las mismas puertas de veredictoPrecio, sin atajos: ni un día menos de
 * historia ni un descuento menos. Ante la duda, el producto no sale.
 *
 * Funciones PURAS: se les pasa todo, sin disco ni reloj.
 */
import { entradasPara, resumirHistorico, veredictoPrecio, NIVEL_DESCUENTO_FALSO } from './historico.js';
import { clavesObservacion, urlProductoLimpia } from './vitrina.js';

const DIA = 86_400_000;

/** Una ficha se conserva este tiempo después de la última vez que se vio. */
export const DIAS_FICHA = 7;

/**
 * Lo que está en oferta HOY: fichas vistas en los últimos días. Una ficha
 * más vieja tiene un precio que ya nadie vio y no se le pone veredicto.
 */
export const DIAS_EN_OFERTA = 3;

/** Una fecha 'YYYY-MM-DD' corrida `dias` hacia atrás. */
const restarDias = (fecha, dias) => new Date(Date.parse(`${fecha}T00:00:00Z`) - dias * DIA).toISOString().slice(0, 10);

/**
 * La ficha de una tarjeta del listado (salida de leerTarjeta).
 * @param {object} t
 * @returns {object|null}
 */
export function fichaDeTarjeta(t) {
  if (!t?.id || !t?.titulo || !t?.url_producto || !(Number(t.precio_actual) > 0)) return null;
  return {
    titulo: String(t.titulo),
    url: String(t.url_producto),
    imagen: t.imagen ?? null,
    precio: Number(t.precio_actual),
    precio_antes: Number(t.precio_previo) > 0 ? Number(t.precio_previo) : null,
    descuento: Number(t.descuento) > 0 ? Math.round(Number(t.descuento)) : 0,
  };
}

/**
 * Mete las fichas de hoy en el catálogo y poda lo que lleva más de
 * `diasFicha` sin verse. La ficha nueva gana: el precio y el descuento de
 * hoy son los que valen.
 *
 * @param {Record<string, object>|null|undefined} previo — catálogo anterior (productos)
 * @param {Record<string, object>|null|undefined} fichas — fichas de hoy, por id de artículo
 * @param {string} fecha — 'YYYY-MM-DD' de la observación
 * @param {{diasFicha?: number}} [opciones]
 * @returns {Record<string, object>}
 */
export function fusionarCatalogo(previo, fichas, fecha, { diasFicha = DIAS_FICHA } = {}) {
  const corte = restarDias(fecha, diasFicha);
  const salida = {};
  for (const [id, f] of Object.entries(previo ?? {})) {
    if (f && typeof f.visto === 'string' && f.visto >= corte && f.visto <= fecha) salida[id] = f;
  }
  for (const [id, f] of Object.entries(fichas ?? {})) {
    if (f && f.titulo && f.url && Number(f.precio) > 0) salida[id] = { ...f, visto: fecha };
  }
  return salida;
}

/**
 * Cuánto llevamos observando: días distintos con algún precio, y desde
 * cuándo. Es lo que se dice en la página antes que cualquier veredicto.
 *
 * @param {Record<string, Array<[string, number, number]>>|null|undefined} productosHist
 * @returns {{dias: number, desde: string|null, hasta: string|null}}
 */
export function estadoObservacion(productosHist) {
  const fechas = new Set();
  for (const entradas of Object.values(productosHist ?? {})) {
    for (const e of Array.isArray(entradas) ? entradas : []) {
      if (Array.isArray(e) && typeof e[0] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e[0])) fechas.add(e[0]);
    }
  }
  const orden = [...fechas].sort();
  return { dias: orden.length, desde: orden[0] ?? null, hasta: orden.at(-1) ?? null };
}

/**
 * El veredicto de cada producto en oferta, agrupado como se publica.
 *
 * @param {{
 *   catalogo: Record<string, object>, historico: Record<string, Array<[string, number, number]>>,
 *   hoy: string, diasEnOferta?: number,
 * }} datos — `hoy` es 'YYYY-MM-DD'
 * @returns {{
 *   falsos: object[], inflados: object[], reales: object[],
 *   siguiendo: number, enOferta: number,
 * }}
 */
export function detectar({ catalogo, historico, hoy, diasEnOferta = DIAS_EN_OFERTA }) {
  const corte = restarDias(hoy, diasEnOferta);
  const falsos = [];
  const inflados = [];
  const reales = [];
  let siguiendo = 0;
  let enOferta = 0;

  for (const [id, f] of Object.entries(catalogo ?? {})) {
    if (!f || typeof f.visto !== 'string' || f.visto < corte || f.visto > hoy || !(Number(f.precio) > 0)) continue;
    enOferta++;
    const claves = clavesObservacion(id, f.url);
    const v = veredictoPrecio(f.precio, resumirHistorico(entradasPara(historico, claves)), { descuento: f.descuento });
    const item = {
      id,
      claves,
      titulo: f.titulo,
      url: urlProductoLimpia(f.url),
      imagen: f.imagen ?? null,
      precio: f.precio,
      precio_antes: f.precio_antes ?? null,
      descuento: f.descuento ?? 0,
      visto: f.visto,
      nivel: v.nivel,
      texto: v.texto,
      dias: v.dias,
      minimo: v.minimo,
    };
    if (v.nivel === NIVEL_DESCUENTO_FALSO) falsos.push(item);
    else if (v.nivel === 'alto') inflados.push(item);
    else if (v.nivel === 'minimo' || v.nivel === 'bajo') reales.push(item);
    else siguiendo++;
  }

  // Primero lo que más grita: el descuento anunciado más grande, y ante
  // empate, lo que más tiempo llevamos viendo.
  const porDescuento = (a, b) => b.descuento - a.descuento || b.dias - a.dias;
  falsos.sort(porDescuento);
  reales.sort(porDescuento);
  // «Ha estado más barato»: primero lo que más lejos está de su mínimo.
  inflados.sort((a, b) => b.precio / b.minimo - a.precio / a.minimo || b.dias - a.dias);

  return { falsos, inflados, reales, siguiendo, enOferta };
}
