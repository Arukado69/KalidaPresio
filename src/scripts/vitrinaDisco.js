/**
 * vitrinaDisco — Lee src/data/vitrina.json para los scripts del build.
 *
 * Los scripts (feed.json, relámpago, tarjetas) corren en Node fuera de Astro y
 * no pueden importar el JSON como lo hacen las páginas. Esto es lo único que
 * comparten: abrir el archivo y pasarlo por la MISMA validación del sitio
 * (src/utils/vitrina.js). Si cada script leyera el JSON a su manera, el día que
 * uno se saltara la validación publicaría un link que no es oficial.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarVitrina } from '../utils/vitrina.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RUTA_VITRINA = path.resolve(__dirname, '../data/vitrina.json');

/**
 * @param {number} [ahora]
 * @returns {ReturnType<typeof cargarVitrina>}
 */
export function leerVitrina(ahora = Date.now()) {
  const crudo = JSON.parse(readFileSync(RUTA_VITRINA, 'utf-8'));
  return cargarVitrina(crudo, ahora);
}
