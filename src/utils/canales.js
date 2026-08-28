/**
 * canales — Registro ÚNICO de las superficies desde las que sale un clic.
 *
 * POR QUÉ EXISTE
 * Hasta ahora `matt_word` solo decía de qué SECCIÓN del sitio salió el clic
 * (`…_relampago`, `…_elegidos`). Eso alcanza mientras el sitio es la única
 * superficie. En cuanto la misma oferta se publica en Telegram, en un canal de
 * WhatsApp y en un video, el panel de afiliados de ML las mezcla todas y no hay
 * forma de saber cuál paga — que es exactamente la decisión que hay que tomar
 * a los 90 días.
 *
 * EL FORMATO
 *   matt_word = <base>_<canal><seccion>
 *                      └─ 2 letras, SIEMPRE presente cuando hay sufijo
 *
 * Dos letras fijas y un juego cerrado de códigos hacen que partir la etiqueta
 * sea determinista: no hay que adivinar dónde termina el canal y empieza la
 * sección. `aLinkAfiliado` sanea la sección a alfanuméricos, así que el sufijo
 * nunca contiene «_» y el matt_word base puede llevar los que quiera.
 *
 * REGLA AL AÑADIR UN CÓDIGO
 * Que no sea prefijo de ninguna sección en uso (`relampago`, `elegidos`,
 * `bento`, `hero`, `imbatibles`, `showpiece`, `whatsapp`, `sugerencia404`…).
 * El test de este módulo lo comprueba: si chocan, la sección se leería partida.
 */

/** Superficies conocidas. La clave es lo que viaja dentro de `matt_word`. */
export const CANALES = Object.freeze({
  wb: 'Sitio web',
  tg: 'Telegram',
  wa: 'Canal de WhatsApp',
  vv: 'Video vertical (TikTok/Reels/Shorts)',
  pn: 'Pinterest',
  cr: 'Correo (boletín)',
  rs: 'Sindicación (RSS/JSON)',
  cm: 'Comunidades',
});

/** El sitio es el canal por defecto: es de donde salía todo hasta ahora. */
export const CANAL_POR_DEFECTO = 'wb';

/** Los códigos, para validar rutas y construir tablas. */
export const CODIGOS_CANAL = Object.freeze(Object.keys(CANALES));

/** @param {string} codigo @returns {boolean} */
export function esCanal(codigo) {
  return typeof codigo === 'string' && Object.hasOwn(CANALES, codigo);
}

/**
 * Devuelve un código válido, o el del sitio si lo que llega no lo es.
 * Nunca lanza: una etiqueta mal escrita no debe romper un enlace que cobra.
 * @param {any} valor
 * @returns {string}
 */
export function normalizarCanal(valor) {
  const c = String(valor ?? '').trim().toLowerCase();
  return esCanal(c) ? c : CANAL_POR_DEFECTO;
}

/** Nombre legible, para el README y los reportes. @param {string} codigo */
export function nombreCanal(codigo) {
  return CANALES[codigo] ?? 'Desconocido';
}

/**
 * Parte el sufijo de `matt_word` en sus dos mitades.
 *
 * Un sufijo anterior a este cambio (sin canal, p. ej. `relampago`) se
 * reconoce por descarte: si las dos primeras letras no son un código conocido,
 * todo el sufijo es la sección y el canal se da por el sitio. Así los enlaces
 * que ya andan por ahí se siguen leyendo bien.
 *
 * @param {string} sufijo — lo que va después del último «_» de matt_word.
 * @returns {{canal: string, seccion: string|null}}
 */
export function partirCampana(sufijo) {
  const s = typeof sufijo === 'string' ? sufijo : '';
  const posible = s.slice(0, 2).toLowerCase();
  if (esCanal(posible)) {
    return { canal: posible, seccion: s.slice(2) || null };
  }
  return { canal: CANAL_POR_DEFECTO, seccion: s || null };
}

/**
 * Compone el sufijo `<canal><seccion>`. Sin sección ni canal explícito
 * devuelve cadena vacía, y entonces `aLinkAfiliado` no añade sufijo: el
 * matt_word queda exactamente como estaba antes de este cambio.
 *
 * @param {string} [campana] — sección/campaña (se sanea a alfanuméricos).
 * @param {string} [canal] — código de canal.
 * @returns {string}
 */
export function componerCampana(campana, canal) {
  const seccion = campana ? String(campana).replace(/[^a-z0-9]/gi, '') : '';
  const codigo = normalizarCanal(canal);
  // Ni sección ni canal distinto del sitio → nada que etiquetar.
  if (!seccion && codigo === CANAL_POR_DEFECTO && !esCanal(canal)) return '';
  return `${codigo}${seccion}`;
}
