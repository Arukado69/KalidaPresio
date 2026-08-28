// backend/enlaces.js — El enlace corto por canal: /r/<canal>/<id>.
//
// POR QUÉ NO LO RESUELVE CADDY
// `/recomienda/*` sale de `redirects.caddy`, que el build reescribe entero cada
// vez. Un id que ya no está en el feed de hoy devuelve 404. Dentro del sitio da
// igual (esa tarjeta tampoco se está mostrando), pero un enlace publicado en
// Telegram hace tres semanas tiene que seguir funcionando: si no, la mitad de
// lo que repartes se apaga sola y encima no te enteras.
//
// CÓMO LLEGA EL MAPA HASTA AQUÍ
// El build publica `public/data/enlaces.json` en el sitio estático. Este módulo
// lo baja cada rato y hace UPSERT en su propia tabla, que nunca borra filas.
// La resolución de un clic NO toca la red: lee SQLite. Si el sitio está caído o
// el fetch falla, los enlaces siguen resolviendo con lo último que se guardó.
//
// EL matt_word
// Se compone aquí, no en el JSON, porque el canal lo decide la RUTA. Si el mapa
// trajera la URL ya etiquetada, todos los canales heredarían la misma etiqueta
// y volveríamos al problema que este archivo existe para resolver.
// Fuente de verdad del formato: src/utils/canales.js (el contenedor del backend
// no comparte código con el frontend; si cambia allá, cambia aquí).

import db from './db.js';

const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://kalidapresio.albis-labs.xyz').replace(/\/$/, '');
const MATT_TOOL = process.env.ML_MATT_TOOL || '';
const MATT_WORD = process.env.ML_MATT_WORD || '';
const INTERVALO_MIN = Number(process.env.ENLACES_SYNC_MIN ?? 30);

/** Códigos de canal válidos. Espejo de CANALES en src/utils/canales.js. */
export const CODIGOS_CANAL = Object.freeze(['wb', 'tg', 'wa', 'vv', 'pn', 'cr', 'rs', 'cm']);
export const CANAL_POR_DEFECTO = 'wb';

const stmtUpsert = db.prepare(`
  INSERT INTO enlaces (ml_id, url, visto_en) VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(ml_id) DO UPDATE SET url = excluded.url, visto_en = CURRENT_TIMESTAMP
`);
const stmtResolver = db.prepare(`SELECT url FROM enlaces WHERE ml_id = ?`);
const stmtClic = db.prepare(`
  INSERT INTO clics (ml_id, canal, seccion, resuelto) VALUES (?, ?, ?, ?)
`);
const stmtTotal = db.prepare(`SELECT COUNT(*) AS n FROM enlaces`);

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
 * Arma la URL final de Mercado Libre con matt_tool y matt_word del canal.
 * @param {string} url — URL de producto sin query.
 * @param {string} canal — código ya normalizado.
 * @param {string|null} seccion
 */
export function conEtiqueta(url, canal, seccion) {
  const base = url.split('?')[0].split('#')[0];
  if (!MATT_TOOL || !MATT_WORD) return base; // Sin credenciales, mejor el enlace limpio que uno roto.
  const sufijo = `${canal}${seccion ?? ''}`;
  return `${base}?matt_tool=${MATT_TOOL}&matt_word=${MATT_WORD}_${sufijo}`;
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

/**
 * Baja el mapa del sitio y lo mete en la tabla. Aditivo: nunca borra.
 * @returns {Promise<number>} enlaces sincronizados (0 si falló).
 */
export async function sincronizar() {
  const url = `${SITE_URL}/data/enlaces.json`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const items = json?.items;
    if (!items || typeof items !== 'object') throw new Error('sin campo "items"');

    let n = 0;
    for (const [id, destino] of Object.entries(items)) {
      const mlId = normalizarId(id);
      if (!mlId || typeof destino !== 'string' || !/^https?:\/\//i.test(destino)) continue;
      stmtUpsert.run(mlId, destino.split('?')[0].split('#')[0]);
      n++;
    }
    console.log(`🔗 [Enlaces] ${n} sincronizados desde ${url} (${stmtTotal.get().n} en total).`);
    return n;
  } catch (e) {
    // No es fatal: la tabla ya tiene lo de la última vez que sí se pudo.
    console.warn(`⚠ [Enlaces] Sincronización fallida (${e.message}). Se sigue con ${stmtTotal.get().n} enlaces guardados.`);
    return 0;
  }
}

/** Arranca la sincronización periódica. Devuelve el timer por si hay que pararlo. */
export function arrancarSincronizacion() {
  sincronizar();
  if (INTERVALO_MIN <= 0) return null;
  const t = setInterval(sincronizar, INTERVALO_MIN * 60 * 1000);
  t.unref?.(); // Que un temporizador no impida cerrar el proceso.
  return t;
}
