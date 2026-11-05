/**
 * compartir — Lee lo que te da el botón «Compartir para ganar una comisión»
 * de la app de Mercado Libre y lo convierte en productos para la vitrina.
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────────
 * Ese botón ya entrega casi todo lo que el sitio necesita para publicar:
 *
 *   ¡Mira lo que encontré! Playera Polo Hombre … - $ 99,59 en Mercado Libre.
 *   Entra aquí: https://meli.la/2Gyywqc
 *
 * título, precio y TU link oficial. Con eso, un producto es publicable sin
 * abrir la computadora: pegas uno o veinte mensajes en /panel/agregar y
 * publicas. La foto, la calificación y las ventas se pueden completar después
 * con el marcador (sin ellas, el sitio lo dice: «sin calificar»).
 *
 * El link se guarda TAL CUAL: es el que lleva tu identificador de afiliado.
 *
 * Funciones PURAS.
 */
import { esLinkOficial } from './vitrina.js';

/** Los links que el sitio acepta, dentro de un texto cualquiera. */
const LINKS = /https?:\/\/(?:meli\.la\/[A-Za-z0-9_-]+|(?:www\.)?mercadolibre\.com(?:\.mx)?\/sec\/[A-Za-z0-9_-]+)/gi;

/**
 * «$ 99,59» → 99.59 · «$ 1.299» → 1299 · «$1,299.50» → 1299.5 · «1.299,50» → 1299.5
 *
 * Mercado Libre escribe los precios distinto según la pantalla (el mensaje de
 * compartir usa coma decimal). La regla: con punto Y coma, el último es el
 * decimal; con uno solo, es decimal si le siguen 1 o 2 dígitos, y de miles si
 * le siguen 3.
 *
 * @param {unknown} s
 * @returns {number|null}
 */
export function precioDeTexto(s) {
  const t = String(s ?? '').replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return null;
  const punto = t.lastIndexOf('.');
  const coma = t.lastIndexOf(',');
  const sep = Math.max(punto, coma);
  let entero = t;
  let decimales = '';
  if (sep >= 0) {
    const despues = t.slice(sep + 1);
    if ((punto >= 0 && coma >= 0) || (despues.length >= 1 && despues.length <= 2)) {
      entero = t.slice(0, sep);
      decimales = despues;
    }
  }
  const n = Number(`${entero.replace(/[.,]/g, '') || '0'}${decimales ? `.${decimales}` : ''}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Quita la frase de entrada («¡Mira lo que encontré!») y la puntuación suelta. */
function limpiarTitulo(s) {
  return s
    .replace(/^\s*¡[^!]{0,60}!\s*/u, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:·]+|[\s\-–—:·]+$/g, '')
    .trim();
}

/**
 * Todos los productos de un texto pegado: uno o muchos mensajes de
 * «compartir», en cualquier orden, con o sin texto alrededor.
 *
 * Cada mensaje termina en su link, así que el texto de un producto es lo que
 * hay entre el link anterior y el suyo. Si el mismo link aparece dos veces,
 * se queda el último.
 *
 * @param {string} texto
 * @returns {{link: string, titulo: string|null, precio: number|null}[]}
 */
export function leerMensajesCompartidos(texto) {
  const s = String(texto ?? '');
  const porLink = new Map();
  let desde = 0;
  for (const m of s.matchAll(LINKS)) {
    const link = m[0];
    const segmento = s.slice(desde, m.index);
    desde = m.index + link.length;
    if (!esLinkOficial(link)) continue;

    // El precio es el ÚLTIMO «$ …» antes del link; el título, lo que va antes
    // de ese precio (el formato es «<título> - $ <precio> en Mercado Libre»).
    const precios = [...segmento.matchAll(/\$\s*([\d][\d.,]*)/g)];
    const ultimo = precios.at(-1);
    const precio = ultimo ? precioDeTexto(ultimo[1]) : null;
    const antes = ultimo ? segmento.slice(0, ultimo.index) : segmento.replace(/entra aqu[ií]\s*:?\s*$/i, '');
    const titulo = limpiarTitulo(antes) || null;

    porLink.delete(link);
    porLink.set(link, { link, titulo, precio });
  }
  return [...porLink.values()];
}

/**
 * Lo que llega cuando eliges «KalidaPresio» en el menú «Compartir» del
 * celular (el panel instalado como app; ver public/panel/manifest.json).
 *
 * Android lo entrega en tres partes que cada app llena a su manera: `texto`
 * (el mensaje completo, lo normal), `titulo` (a veces el título del producto,
 * a veces nada) y `enlace` (casi nunca; a veces el link viene solo aquí).
 * Se lee el texto con el link; el título solo se usa si al producto le falta
 * título o precio, porque pegarlo siempre al frente ensuciaría el título.
 *
 * @param {{titulo?: unknown, texto?: unknown, enlace?: unknown}} recibido
 * @returns {ReturnType<typeof leerMensajesCompartidos>}
 */
export function leerCompartido({ titulo, texto, enlace } = {}) {
  const limpio = (v) => String(v ?? '').trim();
  const t = limpio(titulo);
  const enlaceSolo = limpio(enlace);
  let cuerpo = limpio(texto);
  if (enlaceSolo && !cuerpo.includes(enlaceSolo)) cuerpo = cuerpo ? `${cuerpo}\n${enlaceSolo}` : enlaceSolo;

  let leidos = leerMensajesCompartidos(cuerpo);
  if (!leidos.length && t) return leerMensajesCompartidos(`${t}\n${cuerpo}`);
  if (leidos.length === 1 && t && (!leidos[0].titulo || !leidos[0].precio)) {
    const [con] = leerMensajesCompartidos(`${t}\n${cuerpo}`);
    if (con && con.link === leidos[0].link) {
      leidos = [{ ...leidos[0], titulo: leidos[0].titulo || con.titulo, precio: leidos[0].precio || con.precio }];
    }
  }
  return leidos;
}

/**
 * ¿Trae un link de Mercado Libre que NO es de afiliado? Pasa cuando se usa el
 * «Compartir» normal de la app en vez de «Compartir para ganar una comisión»:
 * ese link no lleva tu identificador y no puede publicarse.
 *
 * @param {unknown} texto
 * @returns {boolean}
 */
export function traeLinkSinComision(texto) {
  const s = String(texto ?? '');
  return /https?:\/\/[^\s]*mercadoli(?:b|v)re\.com/i.test(s) && leerMensajesCompartidos(s).length === 0;
}

/**
 * Mezcla lo pegado con la vitrina del panel: lo nuevo entra arriba; lo que ya
 * estaba (mismo link) actualiza su título, precio y fecha sin perder lo demás
 * (foto, nota, código, links por canal).
 *
 * @param {object[]} productos — la lista del borrador
 * @param {ReturnType<typeof leerMensajesCompartidos>} leidos
 * @param {string} revisado — ISO: cuándo se vieron esos precios
 * @returns {{productos: object[], nuevos: number, actualizados: number, incompletos: number}}
 */
export function mezclarCompartidos(productos, leidos, revisado) {
  const lista = [...productos];
  let nuevos = 0;
  let actualizados = 0;
  let incompletos = 0;
  // Al revés: así el primero que pegaste queda hasta arriba, como lo pegaste.
  for (const l of [...leidos].reverse()) {
    if (!l.titulo || !l.precio) incompletos++;
    const datos = {
      link: l.link,
      ...(l.titulo ? { titulo: l.titulo } : {}),
      ...(l.precio ? { precio: l.precio, revisado } : {}),
    };
    const i = lista.findIndex((p) => String(p?.link ?? '').trim() === l.link);
    if (i >= 0) {
      lista[i] = { ...lista[i], ...datos };
      actualizados++;
    } else {
      lista.unshift(datos);
      nuevos++;
    }
  }
  return { productos: lista, nuevos, actualizados, incompletos };
}
