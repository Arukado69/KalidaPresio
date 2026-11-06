/**
 * vistos — El historial de precios que TÚ vas juntando, producto por producto.
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────────
 * El historial de src/data/historico-precios.json lo llenaba el bot que leía
 * Mercado Libre cada 3 horas. ML bloquea a los servidores desde el 8 de
 * octubre de 2026: desde entonces no entra un solo precio nuevo. Y los
 * productos que llegan desde «Compartir» de la app no traen id de Mercado
 * Libre, así que ni siquiera podrían encontrar su historia ahí.
 *
 * Pero cada vez que compartes, pegas o guardas un producto en el panel, VES
 * su precio ese día. Eso es una observación tan real como la del bot. Antes se
 * tiraba: el precio nuevo pisaba al anterior. Ahora se anota en `vistos`
 * dentro del mismo producto de la vitrina, y el sitio la usa como historial:
 * «El 5 nov estaba a $1,299» es justo lo que alguien quiere saber en el Buen
 * Fin, y sale de lo que tú mismo viste.
 *
 * Formato: el mismo del histórico, [fecha 'YYYY-MM-DD', mínimo, máximo], el más
 * reciente primero. Un mismo día se funde (mínimo y máximo de ese día).
 *
 * Funciones PURAS.
 */
import { registrarPrecio } from './historico.js';

/** Cuántos días con precio se guardan por producto (los más recientes). */
export const MAX_VISTOS = 60;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MX = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
});

/**
 * El día (en la Ciudad de México) de un instante ISO: el día en que TÚ viste
 * el precio. A las 8 de la noche del 5 de noviembre en México ya es día 6 en
 * UTC, y el sitio diría «el 6 nov» de algo que viste el 5.
 *
 * @param {unknown} iso
 * @returns {string|null} 'YYYY-MM-DD'
 */
export function fechaDeRevision(iso) {
  const t = Date.parse(typeof iso === 'string' ? iso : '');
  if (!Number.isFinite(t)) return null;
  const partes = Object.fromEntries(DIA_MX.formatToParts(t).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
}

/**
 * Las entradas que sirven, copiadas (nunca las del objeto original), sin días
 * repetidos, de la más reciente a la más vieja y con tope.
 *
 * @param {unknown} vistos
 * @returns {Array<[string, number, number]>}
 */
export function vistosValidos(vistos) {
  if (!Array.isArray(vistos)) return [];
  const porFecha = new Map();
  for (const e of vistos) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || !FECHA.test(e[0])) continue;
    const min = Number(e[1]);
    const max = Number(e[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) continue;
    const previa = porFecha.get(e[0]);
    porFecha.set(e[0], previa ? [e[0], Math.min(previa[1], min), Math.max(previa[2], max)] : [e[0], min, max]);
  }
  return [...porFecha.values()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .slice(0, MAX_VISTOS);
}

/**
 * Anota que viste `precio` en el instante `revisado`.
 *
 * Si el producto todavía no tenía `vistos` (es de antes de que existiera esto),
 * primero se rescata lo único que ya sabíamos: su último precio y cuándo lo
 * viste. Así el primer cambio de precio ya tiene con qué compararse.
 *
 * @param {{vistos?: unknown, precio?: unknown, revisado?: unknown}|null|undefined} producto — como estaba ANTES
 * @param {unknown} precio — el precio que ves ahora
 * @param {unknown} revisado — ISO: cuándo lo viste
 * @returns {Array<[string, number, number]>}
 */
export function anotarVisto(producto, precio, revisado) {
  let lista = vistosValidos(producto?.vistos);
  if (lista.length === 0) {
    const fechaPrevia = fechaDeRevision(producto?.revisado);
    if (fechaPrevia) lista = registrarPrecio([], fechaPrevia, Number(producto?.precio));
  }
  const fecha = fechaDeRevision(revisado);
  if (fecha) lista = registrarPrecio(lista, fecha, Number(precio));
  return vistosValidos(lista);
}
