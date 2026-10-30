/**
 * detector — Los veredictos de /buen-fin, calculados en build-time.
 *
 * Lee el histórico y el catálogo de fichas con readFileSync (no con import)
 * por lo mismo que src/data/historico.js: si el archivo todavía no existe
 * (antes de la primera observación con fichas), la página sale con su estado
 * vacío en vez de romper el build.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { detectar, estadoObservacion } from '../utils/detector.js';
import { VITRINA } from './ofertas.js';

function leer(nombre) {
  const candidatos = [path.resolve(process.cwd(), 'src/data', nombre), new URL(`./${nombre}`, import.meta.url)];
  for (const ruta of candidatos) {
    try {
      return JSON.parse(readFileSync(ruta, 'utf-8'));
    } catch { /* siguiente candidato */ }
  }
  return null;
}

const historico = leer('historico-precios.json')?.productos ?? {};
const catalogo = leer('catalogo-observado.json')?.productos ?? {};

/** 'YYYY-MM-DD' en UTC, como las fechas del histórico. */
export const HOY = new Date().toISOString().slice(0, 10);

/** Cuántos días llevamos observando, desde y hasta cuándo. */
export const OBSERVACION = estadoObservacion(historico);

const r = detectar({ catalogo, historico, hoy: HOY });

// Un producto con «precio realmente bajo» que además está en tu vitrina se
// enlaza con TU link oficial. Los otros dos grupos van siempre con la URL
// pelada del producto: no se cobra comisión por lo que se señala como
// descuento falso o caro, ni siquiera por accidente.
const oficial = new Map();
for (const p of VITRINA) {
  for (const clave of p.claves_historico ?? [p.id]) oficial.set(clave, p.link_afiliado);
}
const conEnlace = (afiliado) => (x) => {
  const link = afiliado ? x.claves.map((c) => oficial.get(c)).find(Boolean) : null;
  return { ...x, enlace: link ?? x.url, afiliado: Boolean(link) };
};

export const DETECTOR = {
  ...r,
  falsos: r.falsos.map(conEnlace(false)),
  inflados: r.inflados.map(conEnlace(false)),
  reales: r.reales.map(conEnlace(true)),
};

if (r.enOferta) {
  console.log(`🔎 [detector] ${r.enOferta} productos en oferta · ${r.falsos.length} descuento falso · ${r.inflados.length} más barato antes · ${r.reales.length} precio bajo.`);
}
