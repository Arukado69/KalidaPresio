/**
 * verificarFrescura — ¿los precios que sirve el sitio siguen siendo actuales?
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * El pipeline estuvo muerto 43 días sin que nadie se enterara. El fallo era
 * silencioso POR DISEÑO: si el scraper truena, el step de CI falla y no
 * commitea, así que la web conserva el último feed bueno. Esa parte está bien
 * —mejor precios viejos que una web vacía—, lo que faltaba era que alguien
 * avisara.
 *
 * ── QUÉ MIDE Y POR QUÉ ESO ─────────────────────────────────────────────────
 * No mide "¿falló el scraper?" sino "¿están viejos los datos?". La diferencia
 * es lo que separa una alarma útil de uno que se ignora:
 *
 *   · Un fallo suelto con datos de hace 3 h NO es una emergencia (ML tuvo un
 *     hipo, la red falló). Alarmar ahí genera ruido, y una alarma ruidosa se
 *     acaba silenciando — que es como se pierden 43 días.
 *   · Datos viejos SÍ son una emergencia, venga de donde venga: scraper roto,
 *     workflow desactivado por GitHub, cron que no dispara, ML bloqueando la
 *     IP, o alguien que apagó Actions. Una sola señal las cubre todas.
 *
 * Uso:
 *   node src/scripts/verificarFrescura.js              → umbral por defecto
 *   node src/scripts/verificarFrescura.js --horas 12
 *   node src/scripts/verificarFrescura.js --json       → salida para la CI
 *
 * Sale con código 0 si el feed está fresco y 1 si no. Ese código es lo que
 * pone el workflow en rojo y dispara el aviso.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describirFrescura } from '../utils/frescura.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEED = path.resolve(__dirname, '../data/ofertas.json');

/** 4 ciclos perdidos del bot de 3 h. Menos que eso es un hipo, no una avería. */
const HORAS_POR_DEFECTO = 12;

/**
 * Decide si el feed está sano. PURA: se le pasa todo, no lee disco ni reloj.
 *
 * @param {unknown} crudo — el contenido de ofertas.json ya parseado
 * @param {number} maxHoras — umbral de alarma
 * @param {number} ahora — instante de referencia (ms)
 * @returns {{sano: boolean, motivo: string, edadHoras: number|null, items: number, generadoEl: string|null}}
 */
export function evaluarFeed(crudo, maxHoras = HORAS_POR_DEFECTO, ahora = Date.now()) {
  const esArray = Array.isArray(crudo);
  const items = esArray ? crudo : (Array.isArray(crudo?.items) ? crudo.items : null);

  if (!items || items.length === 0) {
    return { sano: false, motivo: 'el feed está vacío o no se pudo leer', edadHoras: null, items: 0, generadoEl: null };
  }

  // Formato antiguo: sin sello no hay forma de saber la edad. Se trata como
  // averiado a propósito — «no lo sé» no puede pasar por «está bien».
  if (esArray || !crudo?.generadoEl) {
    return { sano: false, motivo: 'el feed no trae sello de fecha (`generadoEl`)', edadHoras: null, items: items.length, generadoEl: null };
  }

  const f = describirFrescura(crudo.generadoEl, ahora);
  if (f.nivel === 'desconocido') {
    return { sano: false, motivo: '`generadoEl` no es una fecha válida', edadHoras: null, items: items.length, generadoEl: crudo.generadoEl };
  }

  const sano = f.horas <= maxHoras;
  return {
    sano,
    motivo: sano
      ? `feed de hace ${f.texto.replace(/^hace /, '')}`
      : `el feed tiene ${f.horas.toFixed(1)} h (máximo ${maxHoras} h) — detectado ${f.texto}`,
    edadHoras: f.horas,
    items: items.length,
    generadoEl: crudo.generadoEl,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('verificarFrescura.js')) {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--horas');
  // Ojo con `||` aquí: Number('0') es 0, que es falsy, y un umbral de 0 h
  // —útil para probar la alarma— se convertía en el valor por defecto.
  const pedido = idx !== -1 ? Number(args[idx + 1]) : NaN;
  const maxHoras = Number.isFinite(pedido) ? pedido : HORAS_POR_DEFECTO;
  const comoJson = args.includes('--json');

  let crudo = null;
  try {
    crudo = JSON.parse(readFileSync(FEED, 'utf-8'));
  } catch (e) {
    crudo = null;
  }

  const r = evaluarFeed(crudo, maxHoras);

  if (comoJson) {
    console.log(JSON.stringify(r));
  } else if (r.sano) {
    console.log(`✅ [frescura] Feed sano: ${r.items} ofertas, ${r.motivo}.`);
  } else {
    console.error(`❌ [frescura] FEED VIEJO O INVÁLIDO: ${r.motivo}.`);
    console.error('');
    console.error('   El sitio sigue en pie sirviendo el último feed bueno — eso es intencional.');
    console.error('   Lo que hay que revisar es POR QUÉ dejó de refrescarse:');
    console.error('     1. ¿Falló el scraper?  node src/scripts/importarOfertas.js');
    console.error('     2. ¿Cambió ML el payload de sus tarjetas? (pasó en julio de 2026)');
    console.error('        → los tests de src/utils/mlPayload.test.js dicen qué campo se rompió');
    console.error('     3. ¿Sigue activo el workflow? GitHub desactiva los cron tras 60 días');
    console.error('        sin actividad en el repositorio.');
  }

  process.exit(r.sano ? 0 : 1);
}
