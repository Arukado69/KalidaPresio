/**
 * generarRelampago.js — Auto-genera public/data/relampago.json desde ofertas.json.
 *
 * PROBLEMA QUE RESUELVE:
 * El carrusel Relámpago se alimenta de un JSON estático que nadie actualiza.
 * Cuando sus `endsAt` expiran, la sección queda vacía.
 *
 * SOLUCIÓN:
 * En cada build, este script selecciona las 8 mejores ofertas (alto descuento
 * + alto score + buena calificación) y les genera un `endsAt` de +24 horas
 * desde la hora del build. Así el carrusel SIEMPRE tiene contenido fresco.
 *
 * PIPELINE: package.json → "build": "... && node src/scripts/generarRelampago.js && astro build"
 *
 * El schema de salida es idéntico al que espera initRelampagoFetch() en Layout:
 *   { detectadoEl, ofertas: [{ id, titulo, precioActual, precioOriginal,
 *     descuentoReal, scoreKP, rating, vendidos, imagen, urlAfiliado, badge, endsAt }] }
 *
 * ── POR QUÉ TAMBIÉN MIRA EL HISTÓRICO ───────────────────────────────────────
 * El filtro de arriba (descuento alto + buen rating) no sabe distinguir un
 * descuento real de uno que el histórico ya demostró falso: este es el widget
 * más visible del sitio, y promocionar ahí exactamente lo que el propio sitio
 * acusa de mentir en otra parte sería la contradicción más visible posible.
 * Por eso se descarta 'descuento-falso' antes de elegir candidatas — y SOLO
 * ese nivel: un 'alto' (ha estado más barato) sigue siendo un descuento real.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categorizar } from '../utils/categorias.js';
import { resumirHistorico, veredictoPrecio } from '../utils/historico.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Rutas ─────────────────────────────────────────────────────────────────────
const OFERTAS_PATH = path.resolve(__dirname, '../data/ofertas.json');
const HISTORICO_PATH = path.resolve(__dirname, '../data/historico-precios.json');
const OUTPUT_DIR = path.resolve(__dirname, '../../public/data');
const OUTPUT_PATH = path.resolve(OUTPUT_DIR, 'relampago.json');

// ── Configuración ─────────────────────────────────────────────────────────────
const MIN_DESCUENTO = 25;       // Mínimo % de descuento para entrar al carrusel
const MIN_RATING = 4.0;         // Mínima calificación de compradores
const MAX_ITEMS = 8;            // Máximo de items en el carrusel
const EXPIRA_EN_HORAS = 24;     // Cada oferta "expira" 24h después del build

// ── Proceso ───────────────────────────────────────────────────────────────────
try {
  console.log('\n⚡ [Relámpago] Generando carrusel desde ofertas.json...');

  const raw = fs.readFileSync(OFERTAS_PATH, 'utf-8');
  const crudo = JSON.parse(raw);
  // Array (formato antiguo) o sobre con sello `{ generadoEl, items }`.
  const ofertas = Array.isArray(crudo) ? crudo : (crudo?.items ?? []);
  // El carrusel hereda la fecha de DETECCION del feed, no la del build:
  // es el dato honesto, y `detectadoEl` ya lo pinta el rail en runtime.
  const detectadoEl = (!Array.isArray(crudo) && crudo?.generadoEl) || new Date().toISOString();

  if (!Array.isArray(ofertas) || ofertas.length === 0) {
    console.warn('⚠ [Relámpago] ofertas.json vacío o inválido. Se genera JSON vacío.');
    escribirVacio();
    process.exit(0);
  }

  // Histórico de precios: es lo único que puede decir si el descuento
  // anunciado es real. Si el archivo falta o está corrupto se degrada a "sin
  // histórico" — mismo comportamiento que tendría un producto sin entradas,
  // y por tanto sigue siendo elegible: no hay base para acusarlo de nada.
  let productosHist = {};
  try {
    productosHist = JSON.parse(fs.readFileSync(HISTORICO_PATH, 'utf-8'))?.productos ?? {};
  } catch { /* archivo ausente o ilegible: se sigue con {} */ }

  // 'descuento-falso' es el único nivel que se filtra aquí: acusa al propio
  // descuento anunciado de no ser real, y este es el carrusel más visible del
  // sitio. 'alto' (ha estado más barato) NO se toca — sigue siendo un
  // descuento genuino y excluirlo es una decisión de producto que no le toca
  // a este fix.
  const esDescuentoFalso = (o) => {
    const resumen = resumirHistorico(productosHist[o.id]);
    const v = veredictoPrecio(o.precio_actual, resumen, { descuento: o.descuento });
    return v.nivel === 'descuento-falso';
  };

  // Filtrar: descuento >= MIN y rating >= MIN, y que el descuento no sea falso
  const candidatas = ofertas.filter(o =>
    (o.descuento ?? 0) >= MIN_DESCUENTO &&
    (o.rating ?? 0) >= MIN_RATING &&
    o.link_afiliado &&
    o.titulo &&
    !esDescuentoFalso(o)
  );

  if (candidatas.length === 0) {
    console.warn(`⚠ [Relámpago] Ninguna oferta cumple los criterios (descuento≥${MIN_DESCUENTO}%, rating≥${MIN_RATING}).`);
    escribirVacio();
    process.exit(0);
  }

  // Ordenar por score K-P descendente, desempatar por descuento
  candidatas.sort((a, b) =>
    (b.score_kalidad_presio ?? 0) - (a.score_kalidad_presio ?? 0) ||
    (b.descuento ?? 0) - (a.descuento ?? 0)
  );

  const ahora = new Date();
  const endsAt = new Date(ahora.getTime() + EXPIRA_EN_HORAS * 60 * 60 * 1000).toISOString();

  // Tomar los top N y mapear al schema del carrusel
  const seleccionadas = candidatas.slice(0, MAX_ITEMS).map(o => ({
    id: o.id,
    titulo: o.titulo,
    precioActual: o.precio_actual,
    precioOriginal: o.precio_previo ?? null,
    descuentoReal: Math.round(o.descuento ?? 0),
    scoreKP: o.score_kalidad_presio ?? 0,
    rating: o.rating ?? 0,
    vendidos: o.vendidos ?? 0,
    imagen: o.imagen ?? '',
    // Para la analitica: permite responder que CATEGORIA convierte mejor.
    categoria: categorizar(o.titulo ?? ''),
    urlAfiliado: o.link_afiliado,
    badge: (o.vendidos ?? 0) >= 10000 ? 'MÁS VENDIDO'
         : o.destacado ? o.destacado
         : (o.descuento ?? 0) >= 50 ? 'OFERTA IMPERDIBLE'
         : null,
    endsAt: endsAt,
  }));

  const output = {
    detectadoEl,
    ofertas: seleccionadas,
  };

  // Escribir
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`✅ [Relámpago] ${seleccionadas.length} ofertas seleccionadas (de ${candidatas.length} candidatas).`);
  console.log(`✅ [Relámpago] Expiran: ${endsAt}`);
  console.log(`✅ [Relámpago] Archivo escrito: public/data/relampago.json\n`);

} catch (error) {
  console.error(`\n❌ [Relámpago] Error: ${error.message}`);
  // NO hacer process.exit(1): si esto falla, el build debe continuar
  // con el relampago.json anterior (si existe).
  console.warn('⚠ [Relámpago] El build continuará con el JSON previo (si existe).\n');
}

function escribirVacio() {
  const output = { detectadoEl: new Date().toISOString(), ofertas: [] };
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log('✅ [Relámpago] JSON vacío generado.\n');
}
