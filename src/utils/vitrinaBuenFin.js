/**
 * vitrinaBuenFin — ¿Bajaron de verdad en el Buen Fin los productos que
 * recomendamos? Con lo que viste tú (`vistos`, src/utils/vistos.js).
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────────
 * El detector de /buen-fin (src/utils/detector.js) necesita el catálogo que
 * juntaba el observador diario, y ese catálogo no existe: Mercado Libre bloquea
 * a los servidores y el observador de la computadora no se corrió. Sin esto,
 * la página estrella de la temporada diría «todavía no hay veredictos» los
 * cinco días del Buen Fin.
 *
 * Los productos de la vitrina sí tienen historia: cada vez que los compartes o
 * los guardas en el panel, su precio de ese día queda anotado.
 *
 * ── LA COMPARACIÓN ─────────────────────────────────────────────────────────
 * El truco que se quiere detectar es subir el precio días antes para «bajarlo»
 * en el Buen Fin. Por eso la referencia NO es el último precio antes del 13,
 * sino el MÁS BAJO que le vimos en los 30 días anteriores. Contra él va el más
 * bajo que le vimos DURANTE el Buen Fin. Más de un 2 % (MARGEN_PLANO, el mismo
 * del histórico) es «bajó» o «subió»; menos, es el mismo precio.
 *
 * Solo se compara lo que se vio en los dos momentos. Sin precio de antes, o
 * sin revisarlo en el Buen Fin, no se dice nada de ese producto.
 *
 * Funciones PURAS: las fechas son 'YYYY-MM-DD' (días de la Ciudad de México).
 */
import { vistosValidos } from './vistos.js';
import { MARGEN_PLANO } from './historico.js';

/** Cuántos días antes del Buen Fin cuentan como «precio de antes». */
export const DIAS_REFERENCIA = 30;

const DIA = 86_400_000;

/** 'YYYY-MM-DD' menos `n` días. */
function restarDias(fecha, n) {
  return new Date(Date.parse(`${fecha}T12:00:00Z`) - n * DIA).toISOString().slice(0, 10);
}

/**
 * ¿En qué momento de la temporada estamos?
 * @param {string} hoy — 'YYYY-MM-DD' (Ciudad de México)
 * @param {{inicio: string, fin: string}} buenFin
 * @returns {'antes'|'durante'|'despues'}
 */
export function faseBuenFin(hoy, { inicio, fin }) {
  if (hoy < inicio) return 'antes';
  if (hoy <= fin) return 'durante';
  return 'despues';
}

/** El precio más bajo de unas entradas y el día más reciente en que se vio. */
function masBajo(entradas) {
  let mejor = null;
  for (const [fecha, min] of entradas) {
    if (!mejor || min < mejor.precio || (min === mejor.precio && fecha > mejor.fecha)) mejor = { fecha, precio: min };
  }
  return mejor;
}

/**
 * Un producto: su precio de antes del Buen Fin contra el del Buen Fin.
 *
 * @param {{vistos?: unknown}} producto — normalizado (lleva `vistos`)
 * @param {{inicio: string, fin: string, diasReferencia?: number}} buenFin
 * @returns {{
 *   estado: 'bajo'|'igual'|'subio'|'sin-revisar'|'sin-referencia',
 *   antes: {fecha: string, precio: number}|null,
 *   durante: {fecha: string, precio: number}|null,
 *   cambio: number|null,
 * }} cambio: fracción (−0.08 = 8 % más barato)
 */
export function compararConBuenFin(producto, { inicio, fin, diasReferencia = DIAS_REFERENCIA }) {
  const vistos = vistosValidos(producto?.vistos);
  const desde = restarDias(inicio, diasReferencia);
  const antes = masBajo(vistos.filter((e) => e[0] >= desde && e[0] < inicio));
  const durante = masBajo(vistos.filter((e) => e[0] >= inicio && e[0] <= fin));
  if (!durante) return { estado: 'sin-revisar', antes, durante: null, cambio: null };
  if (!antes) return { estado: 'sin-referencia', antes: null, durante, cambio: null };
  // Con multiplicaciones, como el histórico: 980 contra 1,000 es justo el 2 %
  // y no puede caer de un lado u otro por un decimal de punto flotante.
  const estado = durante.precio < antes.precio * (1 - MARGEN_PLANO) ? 'bajo'
    : durante.precio > antes.precio * (1 + MARGEN_PLANO) ? 'subio'
      : 'igual';
  const cambio = durante.precio / antes.precio - 1;
  return { estado, antes, durante, cambio };
}

/**
 * Toda la selección, agrupada para la página.
 *
 * @template P
 * @param {P[]} productos
 * @param {{inicio: string, fin: string, diasReferencia?: number}} buenFin
 * @returns {{
 *   bajaron: Array<{producto: P} & ReturnType<typeof compararConBuenFin>>,
 *   iguales: Array<{producto: P} & ReturnType<typeof compararConBuenFin>>,
 *   subieron: Array<{producto: P} & ReturnType<typeof compararConBuenFin>>,
 *   sinRevisar: number,
 *   sinReferencia: number,
 * }}
 */
export function resumenBuenFin(productos, buenFin) {
  const r = { bajaron: [], iguales: [], subieron: [], sinRevisar: 0, sinReferencia: 0 };
  for (const producto of Array.isArray(productos) ? productos : []) {
    const c = compararConBuenFin(producto, buenFin);
    if (c.estado === 'bajo') r.bajaron.push({ producto, ...c });
    else if (c.estado === 'igual') r.iguales.push({ producto, ...c });
    else if (c.estado === 'subio') r.subieron.push({ producto, ...c });
    else if (c.estado === 'sin-revisar') r.sinRevisar++;
    else r.sinReferencia++;
  }
  // Primero lo que más bajó; de lo que subió, primero lo que más subió.
  r.bajaron.sort((a, b) => a.cambio - b.cambio);
  r.subieron.sort((a, b) => b.cambio - a.cambio);
  return r;
}
