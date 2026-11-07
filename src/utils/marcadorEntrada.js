/**
 * marcadorEntrada — Qué hace el panel con lo que manda el marcador desde la
 * computadora: guardarlo solo, o abrir el formulario para que lo revises.
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────────
 * En la computadora el marcador ya lee todo de la ficha (título, precio, foto,
 * calificación, vendidos) y toma tu link de la ventanita «Compartir» de la
 * barra de afiliados. Pasar además por el formulario y «Guardar» era un paso
 * de más por producto. Si llega completo, se guarda solo.
 *
 * ── LO QUE NO SE ARRIESGA ──────────────────────────────────────────────────
 * Un link de afiliado pegado al producto equivocado manda a tus compradores a
 * otro artículo, y nadie se entera. Por eso:
 *   · Solo se guarda solo si el link salió de la ventanita «Compartir» de esa
 *     misma página (`link_origen: 'pagina'`) o lo escribiste tú para ese
 *     producto (`'escrito'`). Uno del portapapeles pudo ser el que copiaste
 *     para el producto anterior: ese se revisa en el formulario.
 *   · Si el link ya lo usa OTRO producto de tu vitrina, no se guarda.
 *
 * Funciones PURAS.
 */
import { normalizarProducto, esLinkOficial, claveProducto, urlProductoLimpia, idArticulo } from './vitrina.js';
import { anotarVisto } from './vistos.js';

/** De dónde puede salir el link sin que haga falta confirmarlo. */
export const ORIGENES_CONFIABLES = Object.freeze(['pagina', 'escrito']);

/** Lo que el marcador lee de la ficha y puede actualizar. Lo tuyo (nota, links por canal, destacado, código) no. */
const DE_LA_FICHA = ['titulo', 'precio', 'precio_antes', 'imagen', 'url_producto', 'id_articulo', 'rating', 'vendidos'];

/** Para comparar títulos: sin acentos, mayúsculas ni signos. */
const comparable = (t) => String(t ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * @param {object[]} productos — la lista del panel (sin normalizar)
 * @param {Record<string, unknown>} enviado — lo que mandó el marcador
 * @param {string} ahoraISO — cuándo se vio ese precio
 * @returns {
 *   {estado: 'agregado'|'actualizado', productos: object[], producto: object} |
 *   {estado: 'revisar', motivo: string} |
 *   {estado: 'link-ajeno', ajeno: object}
 * }
 */
export function mezclarDelMarcador(productos, enviado, ahoraISO) {
  const lista = Array.isArray(productos) ? productos : [];
  const e = enviado && typeof enviado === 'object' ? enviado : {};
  const link = String(e.link ?? '').trim();

  if (!esLinkOficial(link)) return { estado: 'revisar', motivo: 'sin-link' };

  // Lo de la ficha, limpio. La URL se lee ANTES de limpiarla: el artículo
  // viaja en wid=/item_id (misma regla que el formulario).
  const datos = {};
  for (const k of DE_LA_FICHA) {
    if (e[k] !== undefined && e[k] !== null && e[k] !== '') datos[k] = e[k];
  }
  if (datos.url_producto) {
    if (!datos.id_articulo) {
      const articulo = idArticulo(String(datos.url_producto));
      if (articulo) datos.id_articulo = articulo;
    }
    datos.url_producto = urlProductoLimpia(String(datos.url_producto)) ?? datos.url_producto;
  }

  // ¿Ya estaba? Por su ficha, o por su link (los que pegaste desde la app no tienen ficha).
  const clave = claveProducto(datos.url_producto);
  const porFicha = clave ? lista.findIndex((p) => claveProducto(p?.url_producto) === clave) : -1;
  const porLink = lista.findIndex((p) => String(p?.link ?? '').trim() === link);

  // El link ya lo usa OTRO producto: lo más probable es que sea el que
  // copiaste antes. No se guarda.
  if (porLink >= 0 && porLink !== porFicha) {
    const otro = lista[porLink];
    const otraFicha = claveProducto(otro?.url_producto);
    const mismo = porFicha < 0 && !otraFicha && comparable(otro?.titulo) === comparable(datos.titulo);
    if (!mismo) return { estado: 'link-ajeno', ajeno: otro };
  }

  // Un link del portapapeles (o suelto en la página) se confirma en el
  // formulario: pudo ser el del producto anterior.
  if (!ORIGENES_CONFIABLES.includes(String(e.link_origen ?? ''))) {
    return { estado: 'revisar', motivo: 'confirmar-link' };
  }

  const i = porFicha >= 0 ? porFicha : porLink;
  const anterior = i >= 0 ? lista[i] : null;
  const nuevo = { ...(anterior ?? {}), ...datos, link, revisado: ahoraISO };
  // La ficha manda en lo que ya no aplica: una relámpago que terminó, un
  // envío que dejó de ser gratis. Los «sí» se guardan; los «no» se quitan.
  for (const k of ['envio_gratis', 'relampago']) {
    if (e[k] === true) nuevo[k] = true;
    else delete nuevo[k];
  }
  if (nuevo.relampago && typeof e.termina === 'string' && e.termina) nuevo.termina = e.termina;
  else delete nuevo.termina;
  nuevo.vistos = anotarVisto(anterior, nuevo.precio, ahoraISO);

  const r = normalizarProducto(nuevo, Date.parse(ahoraISO));
  if ('motivo' in r) return { estado: 'revisar', motivo: r.motivo };

  const salida = [...lista];
  if (i >= 0) salida[i] = nuevo;
  else salida.unshift(nuevo);
  return { estado: i >= 0 ? 'actualizado' : 'agregado', productos: salida, producto: nuevo };
}
