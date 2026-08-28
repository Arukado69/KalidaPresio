/**
 * detectarNichos.js — ¿Qué nicho aguanta un canal propio?
 *
 * ── EL PROBLEMA QUE RESUELVE ───────────────────────────────────────────────
 * Abrir un canal (un Telegram de herramientas, un Pinterest de cocina) cuesta
 * semanas y solo se sabe si sirve después. La decisión suele tomarse por
 * corazonada: «se me antoja tecnología». Pero el feed ya sabe la respuesta —
 * solo que nadie se la ha preguntado.
 *
 * La pregunta que decide no es «¿qué categoría me gusta?» sino «¿de cuál me
 * llegan suficientes ofertas BUENAS cada semana como para publicar sin
 * inventar?». Un canal que se queda sin munición a la tercera semana se
 * abandona, y con él la audiencia que costó juntar.
 *
 * ── QUÉ MIDE, Y CON QUÉ ────────────────────────────────────────────────────
 * Todo sale de datos que ya existen. No hay nada estimado a ojo:
 *
 *   · MUNICIÓN   cuántas ofertas de esa categoría trae el feed de hoy
 *   · DEMANDA    unidades vendidas (mediana) — sin demanda no hay clics
 *   · TICKET     precio mediano — la comisión de ML es un %, así que el mismo
 *                clic paga más en un ticket alto
 *   · CALIDAD    Sello K-P mediano — publicar basura quema el canal
 *   · PERMANENCIA cuántos días llevan en el histórico las ofertas de hoy:
 *                alta = catálogo estable (sirve para Pinterest, que rinde a
 *                meses), baja = rotación (sirve para Telegram, que vive del
 *                aviso inmediato)
 *
 * ── EL LÍMITE, DICHO EN VOZ ALTA ───────────────────────────────────────────
 * La categoría se deriva del TÍTULO, y el histórico solo guarda ids y precios.
 * Por eso el flujo por categoría (cuántas ofertas NUEVAS por día da cada nicho)
 * no se puede medir todavía: solo el flujo GLOBAL, que sí sale del histórico.
 * Se reporta como global y no se reparte a ojo entre categorías.
 *
 * Ejecutar:  npm run detectar-nichos          (tabla)
 *            npm run detectar-nichos -- --json  (para pegarle otro script)
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categorizar } from '../utils/categorias.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEED = path.resolve(__dirname, '../data/ofertas.json');
const HISTORICO = path.resolve(__dirname, '../data/historico-precios.json');

const JSON_SALIDA = process.argv.includes('--json');

// ── Umbrales de veredicto ───────────────────────────────────────────────────
// Un canal diario necesita algo que decir casi todos los días. Con 8 ofertas
// vivas y un feed que rota, se sostiene; con 4 alcanza para una sección
// semanal; por debajo, publicarías relleno — y el relleno es lo que hace que
// la gente silencie el canal.
const MIN_CANAL_PROPIO = 8;
const MIN_SECCION = 4;
const MIN_INDICE_CANAL = 55;

/** El cajón de sastre de categorizar(). No es un nicho: es lo que no se ve. */
const SIN_CLASIFICAR = 'Otros';
/** Por encima de esto, la foto de nichos está demasiado borrosa para decidir. */
const MAX_SIN_CLASIFICAR = 0.20;

function leerJson(ruta, porDefecto) {
  if (!existsSync(ruta)) return porDefecto;
  try {
    return JSON.parse(readFileSync(ruta, 'utf-8'));
  } catch {
    return porDefecto;
  }
}

const mediana = (nums) => {
  const v = nums.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** Normaliza a 0–100 en escala logarítmica entre un piso y un techo. */
const escalaLog = (valor, piso, techo) => {
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= piso) return 0;
  const r = Math.log10(Math.min(v, techo) / piso) / Math.log10(techo / piso);
  return Math.max(0, Math.min(100, r * 100));
};

// ── Carga ───────────────────────────────────────────────────────────────────
const crudo = leerJson(FEED, null);
const ofertas = Array.isArray(crudo) ? crudo : (crudo?.items ?? []);
if (!Array.isArray(ofertas) || ofertas.length === 0) {
  console.error('❌ [nichos] ofertas.json vacío o ilegible. Corre `npm run obtener-ofertas` primero.');
  process.exit(1);
}

const historico = leerJson(HISTORICO, { productos: {} });
const productosHist = historico.productos ?? {};

/** Días distintos observados de un producto, según el histórico. */
const diasEnHistorico = (id) => {
  const entradas = productosHist[id];
  return Array.isArray(entradas) ? entradas.length : 0;
};

// ── Flujo GLOBAL del feed (esto sí es medido, no estimado) ──────────────────
// Cuántos productos DISTINTOS entran por primera vez cada día. Es el techo de
// lo que cualquier canal puede publicar sin repetirse.
const primerasApariciones = {};
for (const entradas of Object.values(productosHist)) {
  if (!Array.isArray(entradas) || !entradas.length) continue;
  const fechas = entradas.map((e) => e?.[0]).filter((f) => typeof f === 'string').sort();
  const primera = fechas[0];
  if (primera) primerasApariciones[primera] = (primerasApariciones[primera] ?? 0) + 1;
}
const diasObservados = Object.keys(primerasApariciones).length;
const productosSeguidos = Object.keys(productosHist).length;
// El primer día no cuenta: ahí "entraron" todos los que ya estaban, y eso
// inflaría el promedio con un arranque que no se repite.
const diasOrdenados = Object.keys(primerasApariciones).sort();
const flujoDiario = diasOrdenados.length > 1
  ? diasOrdenados.slice(1).reduce((s, d) => s + primerasApariciones[d], 0) / (diasOrdenados.length - 1)
  : null;

// ── Agregado por categoría ──────────────────────────────────────────────────
const grupos = new Map();
for (const o of ofertas) {
  const cat = categorizar(o?.titulo ?? '');
  if (!grupos.has(cat)) grupos.set(cat, []);
  grupos.get(cat).push(o);
}

const nichos = [...grupos.entries()].map(([categoria, items]) => {
  const vendidos = mediana(items.map((o) => o.vendidos));
  const ticket = mediana(items.map((o) => o.precio_actual));
  const kp = mediana(items.map((o) => o.score_kalidad_presio));
  const rating = mediana(items.map((o) => o.rating));
  const descuento = mediana(items.map((o) => o.descuento));
  const permanencia = mediana(items.map((o) => diasEnHistorico(o.id)));

  // Los cuatro ejes que deciden si un canal se sostiene. Los pesos dicen qué
  // importa más: sin munición no publicas, sin demanda nadie hace clic.
  const ejes = {
    municion: escalaLog(items.length, 1, 20) * 0.30,
    demanda: escalaLog(vendidos, 100, 100_000) * 0.30,
    ticket: escalaLog(ticket, 200, 8000) * 0.20,
    calidad: (Math.max(0, Math.min(100, kp ?? 0))) * 0.20,
  };
  const indice = Math.round(Object.values(ejes).reduce((a, b) => a + b, 0));

  // «Otros» NO es un nicho: es lo que el clasificador de categorias.js no supo
  // etiquetar. Recomendarle un canal sería recomendar un canal de nada. Se
  // muestra igual porque su tamaño es la medida de cuánto NO estás viendo.
  const veredicto = categoria === SIN_CLASIFICAR
    ? 'Sin clasificar'
    : items.length >= MIN_CANAL_PROPIO && indice >= MIN_INDICE_CANAL
      ? 'Canal propio'
      : items.length >= MIN_SECCION
        ? 'Sección del boletín'
        : 'No da volumen';

  return {
    categoria, ofertas: items.length, indice, veredicto,
    vendidos, ticket, kp, rating, descuento, permanencia,
  };
});

nichos.sort((a, b) => b.indice - a.indice || b.ofertas - a.ofertas);

if (JSON_SALIDA) {
  console.log(JSON.stringify({
    generadoEl: new Date().toISOString(),
    feed: { ofertas: ofertas.length, generadoEl: crudo?.generadoEl ?? null },
    historico: { diasObservados, productosSeguidos, flujoDiario },
    nichos,
  }, null, 2));
  process.exit(0);
}

// ── Reporte ─────────────────────────────────────────────────────────────────
const mxn = (n) => (n === null ? '—' : `$${Math.round(n).toLocaleString('es-MX')}`);
const miles = (n) => {
  if (n === null) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n));
};
const pad = (s, n) => String(s).padEnd(n);
const padI = (s, n) => String(s).padStart(n);

console.log(`\n🔎 [nichos] ${ofertas.length} ofertas del feed${crudo?.generadoEl ? ` (${crudo.generadoEl.slice(0, 10)})` : ''}\n`);

console.log(
  pad('NICHO', 18) + padI('OFERTAS', 8) + padI('ÍNDICE', 8) + padI('VENDIDOS', 10) +
  padI('TICKET', 9) + padI('K-P', 6) + padI('DESC', 6) + padI('DÍAS', 6) + '  VEREDICTO',
);
console.log('─'.repeat(94));

for (const n of nichos) {
  const marca = n.veredicto === 'Canal propio' ? '✔'
    : n.veredicto === 'Sección del boletín' ? '·'
      : n.veredicto === 'Sin clasificar' ? '?' : ' ';
  console.log(
    pad(n.categoria, 18) +
    padI(n.ofertas, 8) +
    padI(n.indice, 8) +
    padI(miles(n.vendidos), 10) +
    padI(mxn(n.ticket), 9) +
    padI(n.kp === null ? '—' : Math.round(n.kp), 6) +
    padI(n.descuento === null ? '—' : `${Math.round(n.descuento)}%`, 6) +
    padI(n.permanencia === null ? '—' : Math.round(n.permanencia), 6) +
    `  ${marca} ${n.veredicto}`,
  );
}

console.log('\n── Flujo del feed (medido en el histórico) ' + '─'.repeat(50));
if (diasObservados <= 1) {
  console.log('   Todavía no hay días suficientes de histórico para medir el flujo.');
  console.log('   Corre `npm run registrar-historico` a diario y vuelve en una semana.');
} else {
  console.log(`   ${productosSeguidos} productos distintos seguidos en ${diasObservados} días observados.`);
  console.log(`   Entran ~${flujoDiario.toFixed(1)} productos NUEVOS al día en TODO el feed.`);
  console.log('   Ese es el techo: ningún canal puede publicar más que eso sin repetirse.');
}

const sinClasificar = nichos.find((n) => n.categoria === SIN_CLASIFICAR);
const proporcionSinClasificar = (sinClasificar?.ofertas ?? 0) / ofertas.length;
if (proporcionSinClasificar > MAX_SIN_CLASIFICAR) {
  console.log('\n⚠  ── Antes de decidir nada ' + '─'.repeat(65));
  console.log(`   ${sinClasificar.ofertas} de ${ofertas.length} ofertas (${Math.round(proporcionSinClasificar * 100)} %) caen en «Otros».`);
  console.log('   No es un nicho: es lo que el clasificador de src/utils/categorias.js no');
  console.log('   supo etiquetar. Con esa proporción, el reparto de arriba está borroso y');
  console.log('   podrías estar descartando un nicho que sí existe. Añade reglas ahí primero.');
}

const conCanal = nichos.filter((n) => n.veredicto === 'Canal propio');
console.log('\n── Qué hacer con esto ' + '─'.repeat(70));
if (conCanal.length) {
  const primero = conCanal[0];
  console.log(`   Empieza por ${primero.categoria}: ${primero.ofertas} ofertas vivas, ticket mediano ${mxn(primero.ticket)}.`);
  console.log(`   Ábrele su propio canal y etiquétalo — el sufijo del matt_word ya soporta`);
  console.log(`   canal + sección, así que a los 90 días el panel de ML te dice si valió la pena.`);
  if (conCanal.length > 1) {
    console.log(`   En espera (NO al mismo tiempo): ${conCanal.slice(1).map((n) => n.categoria).join(', ')}.`);
  }
} else {
  console.log('   Ningún nicho aguanta hoy un canal propio: el feed está muy repartido.');
  console.log('   Publica mezclado por ahora y vuelve a correr esto cuando el feed crezca.');
}
console.log('   La columna DÍAS decide el formato: alta → Pinterest (rinde a meses);');
console.log('   baja → Telegram/WhatsApp (rotación rápida, el aviso es el producto).\n');
