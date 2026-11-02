/**
 * paginaProducto — Qué productos tienen página propia (/p/<slug>), en qué
 * estado, y la gráfica de su precio.
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────────
 * Las colecciones y las secciones desaparecen solas cuando se quedan con pocos
 * productos, y la regla de los 7 días esconde un precio sin revisar: el sitio
 * PERDÍA páginas indexadas cada semana. Una página por producto se queda:
 * con la oferta cuando está vigente, y con su historial y un aviso honesto
 * cuando no.
 *
 * Tiene página todo producto con link oficial, título y precio, en tres
 * estados:
 *   · vigente  — se publica hoy, igual que en la portada
 *   · vencido  — su precio lleva más de 7 días sin revisarse, o su relámpago
 *                terminó: la página lo dice y no lo presenta como oferta
 *   · retirado — lo quitaste de la vitrina (va en `retirados` de vitrina.json):
 *                la página se queda con su historial
 * Un borrador sin link oficial no tiene página: nunca se publicó.
 *
 * Funciones PURAS: sin disco, sin red, sin reloj propio.
 */
import { esLinkOficial, normalizarProducto } from './vitrina.js';

const DIA = 86_400_000;

/** Más días que esto sin observar y la línea de la gráfica se corta. */
const HUECO_MAXIMO_DIAS = 3;

/**
 * @param {any} crudo — vitrina.json ya parseado
 * @param {number} [ahora]
 * @returns {{slug: string, producto: object, estado: 'vigente'|'vencido'|'retirado', motivo: string|null, retirado: string|null}[]}
 */
export function paginasDeVitrina(crudo, ahora = Date.now()) {
  const activos = Array.isArray(crudo) ? crudo : (Array.isArray(crudo?.productos) ? crudo.productos : []);
  const retirados = Array.isArray(crudo?.retirados) ? crudo.retirados : [];
  const paginas = [];
  const vistos = new Set();

  const agregar = (entrada, esRetirado) => {
    if (!esLinkOficial(entrada?.link)) return;
    const hoy = normalizarProducto(entrada, ahora);
    const r = 'producto' in hoy ? hoy : normalizarProducto(entrada, ahora, { exigirVigencia: false });
    if (!('producto' in r)) return; // le falta título, precio o fecha de revisión
    const p = r.producto;
    // Si el mismo producto está activo y retirado, manda el activo.
    if (vistos.has(p.id)) return;
    vistos.add(p.id);
    const retirado = typeof entrada.retirado === 'string' && !Number.isNaN(Date.parse(entrada.retirado))
      ? new Date(entrada.retirado).toISOString()
      : null;
    paginas.push({
      slug: p.slug,
      producto: p,
      estado: esRetirado ? 'retirado' : ('producto' in hoy ? 'vigente' : 'vencido'),
      motivo: 'motivo' in hoy ? hoy.motivo : null,
      retirado: esRetirado ? retirado : null,
    });
  };

  activos.forEach((e) => agregar(e, false));
  retirados.forEach((e) => agregar(e, true));
  return paginas;
}

/**
 * Un punto por día observado, del más viejo al más nuevo, dentro de los
 * últimos `dias` hasta `hasta`.
 *
 * @param {Array<[string, number, number]>} entradas
 * @param {{hasta?: string, dias?: number}} [opciones]
 * @returns {{fecha: string, min: number, max: number}[]}
 */
export function seriePrecios(entradas, { hasta, dias = 90 } = {}) {
  const corte = hasta ? new Date(Date.parse(`${hasta}T00:00:00Z`) - (dias - 1) * DIA).toISOString().slice(0, 10) : '';
  return (Array.isArray(entradas) ? entradas : [])
    .filter((e) => Array.isArray(e) && /^\d{4}-\d{2}-\d{2}$/.test(e[0]) && e[1] > 0 && e[2] >= e[1] && e[0] >= corte && (!hasta || e[0] <= hasta))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([fecha, min, max]) => ({ fecha, min, max }));
}

/**
 * Las coordenadas de la gráfica (SVG, el eje Y crece hacia abajo), calculadas
 * aquí para poder probarlas.
 *
 * El eje X va por FECHA, no por posición: tres semanas sin observar tienen
 * que verse como un hueco, no como una línea continua que inventa precios.
 * Por eso la línea se corta donde faltan más de unos días.
 *
 * @param {{fecha: string, min: number, max: number}[]} serie
 * @param {{ancho?: number, alto?: number, margen?: number}} [opciones]
 * @returns {null | {
 *   ancho: number, alto: number, ruta: string,
 *   puntos: {fecha: string, min: number, max: number, x: number, yMin: number, yMax: number}[],
 *   minimo: number, maximo: number, yMinimo: number, desde: string, hasta: string,
 * }}
 */
export function graficaPrecios(serie, { ancho = 600, alto = 180, margen = 10 } = {}) {
  if (!Array.isArray(serie) || serie.length < 2) return null;
  const t0 = Date.parse(serie[0].fecha);
  const t1 = Date.parse(serie.at(-1).fecha);
  const minimo = Math.min(...serie.map((p) => p.min));
  const maximo = Math.max(...serie.map((p) => p.max));
  // Aire arriba y abajo; un precio que nunca se movió queda al centro.
  const holgura = (maximo - minimo) * 0.15 || minimo * 0.05 || 1;
  const bajo = minimo - holgura;
  const alto_ = maximo + holgura;
  const r1 = (n) => Math.round(n * 10) / 10;
  const x = (fecha) => r1(margen + ((Date.parse(fecha) - t0) / (t1 - t0 || 1)) * (ancho - 2 * margen));
  const y = (v) => r1(alto - margen - ((v - bajo) / (alto_ - bajo)) * (alto - 2 * margen));

  const puntos = serie.map((p) => ({ ...p, x: x(p.fecha), yMin: y(p.min), yMax: y(p.max) }));
  const ruta = puntos
    .map((p, i) => {
      const hueco = i > 0 && (Date.parse(p.fecha) - Date.parse(puntos[i - 1].fecha)) / DIA > HUECO_MAXIMO_DIAS;
      return `${i === 0 || hueco ? 'M' : 'L'}${p.x},${p.yMin}`;
    })
    .join(' ');

  return {
    ancho, alto, ruta, puntos, minimo, maximo,
    yMinimo: y(minimo),
    desde: serie[0].fecha,
    hasta: serie.at(-1).fecha,
  };
}
