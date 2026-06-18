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
 *     descuentoReal, scoreKP, rating, opiniones, imagen, urlAfiliado, badge, endsAt }] }
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Rutas ─────────────────────────────────────────────────────────────────────
const OFERTAS_PATH = path.resolve(__dirname, '../data/ofertas.json');
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
  const ofertas = JSON.parse(raw);

  if (!Array.isArray(ofertas) || ofertas.length === 0) {
    console.warn('⚠ [Relámpago] ofertas.json vacío o inválido. Se genera JSON vacío.');
    escribirVacio();
    process.exit(0);
  }

  // Filtrar: descuento >= MIN y rating >= MIN
  const candidatas = ofertas.filter(o =>
    (o.descuento ?? 0) >= MIN_DESCUENTO &&
    (o.rating ?? 0) >= MIN_RATING &&
    o.link_afiliado &&
    o.titulo
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
    opiniones: o.opiniones ?? 0,
    imagen: o.imagen ?? '',
    urlAfiliado: o.link_afiliado,
    badge: o.mas_vendido ? 'MÁS VENDIDO'
         : o.destacado ? o.destacado
         : (o.descuento ?? 0) >= 50 ? 'OFERTA IMPERDIBLE'
         : null,
    endsAt: endsAt,
  }));

  const output = {
    detectadoEl: ahora.toISOString(),
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
