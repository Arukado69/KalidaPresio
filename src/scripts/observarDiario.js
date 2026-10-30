/**
 * observarDiario — La foto diaria de precios, para correr en TU computadora.
 *
 * ── POR QUÉ EN TU COMPUTADORA ──────────────────────────────────────────────
 * Mercado Libre bloquea a los servidores (GitHub, el VPS) desde el 8 de
 * octubre de 2026: el observador ya no puede correr en Actions. Desde una
 * conexión de casa debería poder; si ML también la bloquea, la sonda de
 * observarPrecios lo dice y aquí no se sube nada.
 *
 * ── POR QUÉ A DIARIO ───────────────────────────────────────────────────────
 * «Descuento falso» exige una ventana de 14 días con el 70 % observado
 * (src/utils/historico.js), y un día sin mirar no se recupera nunca. Para el
 * Buen Fin (13 al 17 de noviembre de 2026) eso quiere decir: empezar ya.
 *
 * En orden, y se detiene en el primer error:
 *   1. (con --subir) git pull: el histórico parte de la última versión.
 *   2. observarPrecios + registrarHistorico.
 *   3. (con --subir) commit y push de historico-precios.json: solo ese
 *      archivo, solo si cambió y solo desde la rama principal.
 *
 * Uso:
 *   npm run observar-diario              → observa y registra; no sube nada
 *   npm run observar-diario -- --subir   → además lo sube (para el programador de tareas)
 */
import { spawnSync } from 'node:child_process';

const RAMA = process.env.RAMA_OBSERVADOR || 'main';
const ARCHIVO = 'src/data/historico-precios.json';
const subir = process.argv.includes('--subir');

/** Corre un comando a la vista. Sin shell: el mensaje del commit lleva espacios. */
function correr(cmd, args) {
  console.log(`\n$ ${cmd === process.execPath ? 'node' : cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n✗ [observador] Falló «${args.join(' ')}» (${r.status ?? r.error?.message}). No se sigue.`);
    process.exit(r.status || 1);
  }
}

/** La salida de un comando, sin mostrarla. */
const leer = (cmd, args) => (spawnSync(cmd, args, { encoding: 'utf-8' }).stdout || '').trim();

console.log(`👁️  [observador] ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} (CDMX)`);

if (subir) {
  const rama = leer('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (rama !== RAMA) {
    console.error(`✗ [observador] Estás en «${rama || '¿sin git?'}», no en «${RAMA}»: el histórico se sube a ${RAMA}.`);
    console.error('  Lo más cómodo es una copia del repositorio solo para el observador (ver docs/vitrina.md).');
    process.exit(1);
  }
  correr('git', ['pull', '--rebase', '--autostash', 'origin', RAMA]);
}

correr(process.execPath, ['src/scripts/observarPrecios.js']);
correr(process.execPath, ['src/scripts/registrarHistorico.js']);

if (!subir) {
  console.log(`\n✅ [observador] Listo. Para subirlo: npm run observar-diario -- --subir`);
} else if (!leer('git', ['status', '--porcelain', '--', ARCHIVO])) {
  console.log('\n✅ [observador] Sin cambios de precio que subir hoy.');
} else {
  correr('git', ['commit', '-m', 'chore: observación diaria de precios', '--', ARCHIVO]);
  correr('git', ['push', 'origin', RAMA]);
  console.log('\n✅ [observador] Histórico subido: el sitio lo usa desde su próximo build.');
}
