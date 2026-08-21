// src/scripts/importarOfertas.js
// KalidaPresio — Port directo del flujo de n8n a la web (independiente de n8n).
//   1) Descargar HTML de la página de ofertas de Mercado Libre
//   2) "Extraer Datos Base"      → parseo del appProps embebido
//   3) "Calcular Score KalidaPresio" → scoring + filtros + orden
//   4) Escribir src/data/ofertas.json
// Ejecutar: npm run obtener-ofertas
// Requiere: Node.js >= 22.12.0

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerTarjeta } from '../utils/mlPayload.js';
import { calcularScorePorSeccion, fraccionVolumen } from '../utils/scoreSecciones.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Carga de credenciales de afiliado (opcional) ─────────────────────────────────
// En local: desde .env. En Cloudflare: desde Environment Variables del dashboard.
try {
  process.loadEnvFile(path.resolve(__dirname, '../../.env'));
} catch { /* sin .env: se usan los defaults de abajo / process.env */ }

// ════════════════════════════════════════════════════════
// CONFIGURACIÓN (idéntica a la del flujo n8n)
// ════════════════════════════════════════════════════════
const MATT_TOOL = process.env.ML_MATT_TOOL || '68549198';
const MATT_WORD = process.env.ML_MATT_WORD || 'ci20241127172754';

const URL_OFERTAS   = 'https://www.mercadolibre.com.mx/ofertas';
const PRECIO_MINIMO = 200;   // Filtro guillotina
const SCORE_MINIMO  = 70;    // Umbral de "joya"
const OUTPUT        = path.resolve(__dirname, '../data/ofertas.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ════════════════════════════════════════════════════════
// PASO 1 — Descargar HTML
// ════════════════════════════════════════════════════════
async function descargarHtml() {
  const res = await fetch(URL_OFERTAS, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.9' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${URL_OFERTAS}`);
  return await res.text();
}

// ════════════════════════════════════════════════════════
// PASO 2 — "Extraer Datos Base" (port del nodo Code de n8n)
// ════════════════════════════════════════════════════════
function extraerDatosBase(html) {
  const regex = /"appProps":({.*?}),"mainEntry"/s;
  const match = html.match(regex);
  if (!match) throw new Error('No se encontró "appProps" en el HTML (¿cambió la estructura de ML?).');

  const items = JSON.parse(match[1]).pageProps.data.items;

  // La lectura de cada tarjeta vive en src/utils/mlPayload.js: una sola vez,
  // pura y con tests. Antes estaba copiada aquí y en extraer-secciones.mjs con
  // distinta resistencia, y cuando ML renombró sus componentes en julio de 2026
  // esta copia —la que alimenta el sitio— se rompió en silencio 43 días.
  const aAfiliado = (url) => `${url.split('?')[0]}?matt_tool=${MATT_TOOL}&matt_word=${MATT_WORD}`;

  return items.map((item) => leerTarjeta(item, aAfiliado)).filter(Boolean);
}

// ════════════════════════════════════════════════════════
// PASO 3 — "Calcular Score KalidaPresio" (port del nodo Code de n8n)
//   Rating 65% · Descuento 20% (tope 40) · Volumen de ventas 15% (log)
// ════════════════════════════════════════════════════════
function calcularScore(data) {
  // Delegado a la fuente única (src/utils/scoreSecciones.js). Era la tercera
  // copia de la fórmula en el proyecto; ya no queda ninguna.
  return calcularScorePorSeccion(data, 'default');
}

// CONFIANZA (0–100): ¿qué tan respaldada está la compra? Distinto del K-P (qué
// tan buena es la oferta). Solo señales objetivas y difíciles de falsear.
//
// Reponderado el 2026-08-20: ML retiró la insignia "MÁS VENDIDO" de las
// tarjetas, que valía 40 puntos. Su papel lo absorbe el volumen de ventas, que
// además es más granular — un producto con 50 mil unidades vendidas está más
// respaldado que uno con una etiqueta editorial.
//   Volumen de ventas 60% (escala log) · Vendedor reputado 40%
function calcularConfianza(data) {
  const c = fraccionVolumen(data.vendidos) * 60 + (data.vendedor_confiable ? 40 : 0);
  return Math.round(Math.min(c, 100));
}

function evaluarYFiltrar(items) {
  return items
    .map((data) => {
      // Filtro guillotina: precio mínimo y que tenga calificación real
      if (data.precio_actual < PRECIO_MINIMO || data.rating === 0) return null;
      return {
        ...data,
        score_kalidad_presio: calcularScore(data),
        confianza:            calcularConfianza(data),
      };
    })
    .filter((i) => i !== null)
    .filter((i) => i.score_kalidad_presio >= SCORE_MINIMO)
    // Orden: primero por K-P; ante empates (frecuentes), gana la mayor confianza.
    .sort((a, b) => b.score_kalidad_presio - a.score_kalidad_presio || b.confianza - a.confianza);
}

// ════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════
async function main() {
  console.log('\n🛰  [KalidaPresio] Descargando ofertas de Mercado Libre...');
  const html = await descargarHtml();

  console.log('🧩  Extrayendo datos base...');
  const base = extraerDatosBase(html);
  console.log(`   → ${base.length} productos crudos en la página.`);

  const joyas = evaluarYFiltrar(base);
  console.log(`💎  ${joyas.length} ofertas superan el filtro (precio ≥ $${PRECIO_MINIMO}, score ≥ ${SCORE_MINIMO}).`);

  if (joyas.length === 0) {
    throw new Error('0 ofertas tras el filtro. No se sobrescribe ofertas.json para no dejar la web vacía.');
  }

  // Sobre con SELLO DE FECHA, igual que secciones-feed.json.
  //
  // Antes era un array pelón: no había forma de saber CUÁNDO se detectaron esos
  // precios, y el pie del sitio acababa mostrando la fecha del build como si
  // fuera la de los datos. Con esto el sitio puede decir la verdad («precios
  // detectados hace 2 h») en vez de una frescura que no se ha ganado.
  //
  // `src/data/ofertas.js` acepta las dos formas, así que el sitio sigue
  // funcionando con un ofertas.json viejo hasta que el bot escriba el nuevo.
  const sobre = {
    generadoEl: new Date().toISOString(),
    fuente: URL_OFERTAS,
    total: joyas.length,
    items: joyas,
  };
  await writeFile(OUTPUT, JSON.stringify(sobre, null, 2), 'utf-8');
  console.log(`💾  ofertas.json actualizado con ${joyas.length} productos (sellado ${sobre.generadoEl}).`);
  console.log(`🏆  Mejor: "${joyas[0].titulo?.slice(0, 50)}" (score ${joyas[0].score_kalidad_presio}).\n`);
}

main().catch((err) => {
  console.error(`\n✗ [KalidaPresio] Error: ${err.message}\n`);
  process.exit(1);
});
