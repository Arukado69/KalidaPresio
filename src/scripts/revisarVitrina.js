/**
 * revisarVitrina — La revisión diaria: ¿está publicando el sitio?
 *
 * Lee src/data/vitrina.json (lo que VA a salir) y el /data/feed.json del sitio
 * en vivo (lo que la gente ve HOY), y escribe el texto del issue de alarma. La
 * decisión vive en src/utils/alarmaVitrina.js; aquí solo hay entrada/salida.
 *
 * Uso:
 *   npm run revisar-vitrina                      → informe en la consola
 *   node src/scripts/revisarVitrina.js --sin-red → solo el archivo, sin mirar el sitio
 *   node src/scripts/revisarVitrina.js --anterior issue.md --cuerpo cuerpo.md --comentario nuevo.md
 *
 * En GitHub Actions deja en GITHUB_OUTPUT `estado` (ok/aviso/alarma), `titulo`
 * y `novedades` (true si hay algo que el issue anterior no decía). Sale con 0
 * aunque haya alarma: el workflow decide qué hacer con el estado y se pone en
 * rojo al final. Un código distinto de 0 es que el script mismo se rompió.
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { RUTA_VITRINA } from './vitrinaDisco.js';
import {
  evaluarVitrina,
  evaluarEnVivo,
  diagnosticar,
  novedades,
  redactar,
  MINIMO_PUBLICABLES,
  HORAS_AVISO,
} from '../utils/alarmaVitrina.js';

const args = process.argv.slice(2);
const valor = (nombre) => {
  const i = args.indexOf(nombre);
  return i !== -1 ? args[i + 1] : undefined;
};
const numero = (v, porDefecto) => (Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : porDefecto);

const SITIO = (valor('--sitio') || process.env.SITE_URL || 'https://kalidapresio.albis-labs.xyz').replace(/\/+$/, '');
const MINIMO = numero(valor('--minimo') ?? process.env.MIN_PUBLICABLES, MINIMO_PUBLICABLES);
const HORAS = numero(valor('--horas-aviso') ?? process.env.HORAS_AVISO, HORAS_AVISO);

/** El feed en vivo, o null si no responde: eso mismo es lo que se reporta. */
async function leerFeedEnVivo() {
  try {
    const r = await fetch(`${SITIO}/data/feed.json`, {
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      console.warn(`⚠ [vitrina] ${SITIO}/data/feed.json respondió HTTP ${r.status}.`);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.warn(`⚠ [vitrina] No se pudo leer el feed en vivo: ${e.message}`);
    return null;
  }
}

const ahora = Date.now();
const crudo = JSON.parse(readFileSync(RUTA_VITRINA, 'utf-8'));
const vitrina = evaluarVitrina(crudo, { ahora, minimo: MINIMO, horasAviso: HORAS });
const enVivo = args.includes('--sin-red') ? [] : evaluarEnVivo(await leerFeedEnVivo(), { ahora, minimo: MINIMO });
const d = diagnosticar(vitrina, enVivo);

const rutaAnterior = valor('--anterior');
let anterior = '';
try {
  if (rutaAnterior) anterior = readFileSync(rutaAnterior, 'utf-8');
} catch { /* sin issue anterior */ }
const nuevas = novedades(anterior, d.claves);
const { titulo, cuerpo, comentario } = redactar(d, { sitio: SITIO, ahora, minimo: MINIMO, horasAviso: HORAS, nuevas });

if (valor('--cuerpo')) writeFileSync(valor('--cuerpo'), cuerpo, 'utf-8');
if (valor('--comentario')) writeFileSync(valor('--comentario'), comentario, 'utf-8');

if (process.env.GITHUB_OUTPUT) {
  // Un salto de línea en el título podría colar otra salida (p. ej. estado=ok).
  const unaLinea = titulo.replace(/[\r\n]+/g, ' ');
  appendFileSync(process.env.GITHUB_OUTPUT, `estado=${d.estado}\ntitulo=${unaLinea}\nnovedades=${nuevas.length > 0}\n`);
}

console.log(`${titulo}\n`);
console.log(cuerpo.replace(/<!--[\s\S]*?-->\n?/g, ''));
