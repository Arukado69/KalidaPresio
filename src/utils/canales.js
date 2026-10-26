/**
 * canales — Registro ÚNICO de las superficies donde se publica.
 *
 * POR QUÉ EXISTE
 * La misma oferta sale en el sitio, en el canal de WhatsApp, en Telegram y en
 * un video. Para saber cuál de esas superficies vende hay que poder separarlas,
 * y eso solo lo hace bien Mercado Libre: en tu panel de afiliados creas una
 * ETIQUETA por canal (web, whatsapp, telegram…) y generas el link de cada
 * producto con la etiqueta que toca. El panel te da clics y ventas por
 * etiqueta, y a los 90 días sabes en pesos qué canal mantener.
 *
 * ANTES el sitio intentaba hacer esto él solo, pegándole un sufijo inventado
 * al `matt_word` (`…_tgrelampago`). Mercado Libre no reconoce etiquetas que no
 * diste de alta y sus términos prohíben editar el link generado, así que ese
 * camino se eliminó: los links se publican tal cual salen del generador.
 *
 * QUÉ SE HACE CON ESTOS CÓDIGOS
 *   · Son las claves de `enlaces` en src/data/vitrina.json, para guardar el
 *     link oficial de cada canal cuando generas uno distinto por etiqueta.
 *   · Eligen la plantilla de texto del panel de publicación (/panel/hoy).
 *   · Viajan en los eventos de Umami para separar el tráfico por superficie.
 */

/** Superficies conocidas. La clave es la que se escribe en `enlaces`. */
export const CANALES = Object.freeze({
  wb: 'Sitio web',
  wa: 'WhatsApp',
  tg: 'Telegram',
  fb: 'Facebook',
  ig: 'Instagram',
  tt: 'TikTok',
  pn: 'Pinterest',
  cr: 'Correo (boletín)',
});

/** El sitio es el canal por defecto: es de donde sale todo lo que no se etiqueta. */
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
