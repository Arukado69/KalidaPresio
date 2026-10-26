// backend/enlaces.js — Los enlaces cortos VIEJOS: /r/<canal>/<id>.
//
// QUÉ ERAN
// Un enlace para publicar fuera del sitio que redirigía a Mercado Libre con un
// `matt_word` armado aquí (`<base>_<canal><seccion>`). Mercado Libre no
// reconoce etiquetas que no diste de alta en tu panel y sus términos piden
// publicar el link del generador sin editarlo: esas compras no se atribuían.
//
// QUÉ SON AHORA
// Solo una red de seguridad para lo que ya anda publicado. La tabla `enlaces`
// conserva el mapa id → URL del producto que se acumuló hasta octubre de 2026;
// el redirect manda a esa ficha SIN parámetros. Ya no se sincroniza nada: los
// enlaces nuevos son los oficiales de src/data/vitrina.json y no pasan por aquí.

import db from './db.js';

/** Códigos de canal válidos. Espejo de CANALES en src/utils/canales.js. */
export const CODIGOS_CANAL = Object.freeze(['wb', 'wa', 'tg', 'fb', 'ig', 'tt', 'pn', 'cr']);
export const CANAL_POR_DEFECTO = 'wb';

const stmtResolver = db.prepare(`SELECT url FROM enlaces WHERE ml_id = ?`);
const stmtClic = db.prepare(`
  INSERT INTO clics (ml_id, canal, seccion, resuelto) VALUES (?, ?, ?, ?)
`);

/** @param {any} c @returns {string} código válido, o el del sitio. */
export function normalizarCanal(c) {
  const v = String(c ?? '').trim().toLowerCase();
  return CODIGOS_CANAL.includes(v) ? v : CANAL_POR_DEFECTO;
}

/**
 * Id de ML en forma canónica, o null. Se valida con lista blanca porque este
 * valor entra en una consulta y en una redirección: nada de confiar en la ruta.
 * @param {any} id
 */
export function normalizarId(id) {
  const v = String(id ?? '').trim().toUpperCase();
  return /^ML[A-Z]\d{6,}$/.test(v) ? v : null;
}

/** Sección saneada igual que en el frontend: alfanuméricos y nada más. */
export function normalizarSeccion(s) {
  const v = String(s ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
  return v || null;
}

/**
 * La URL guardada, sin query ni ancla: nunca se le pega nada.
 * @param {string} url
 */
export function destinoLimpio(url) {
  return url.split('?')[0].split('#')[0];
}

/** @param {string} mlId @returns {string|null} URL sin query, o null. */
export function resolver(mlId) {
  return stmtResolver.get(mlId)?.url ?? null;
}

/** Registra el clic. Nunca lanza: la analítica no puede tumbar el redirect. */
export function registrarClic(mlId, canal, seccion, resuelto) {
  try {
    stmtClic.run(mlId, canal, seccion, resuelto ? 1 : 0);
  } catch (e) {
    console.error(`⚠ [Enlaces] No se pudo registrar el clic: ${e.message}`);
  }
}
