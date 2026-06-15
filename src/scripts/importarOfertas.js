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

  const rawData = JSON.parse(match[1]);
  const items = rawData.pageProps.data.items;

  return items.map((item) => {
    const p = item.card;
    if (!p) return null;

    const reviews   = p.components.find((c) => c.type === 'reviews')?.reviews;
    const priceData = p.components.find((c) => c.type === 'price')?.price;

    // ── Descuento REAL ────────────────────────────────────────────────────────────
    // ML no llena price.discount.value; el descuento vive en previous_price /
    // discount_label. (El n8n original solo leía .discount.value → salía 0.)
    const precioActual = priceData?.current_price?.value || 0;
    const precioPrevio = priceData?.previous_price?.value || 0;
    let descuento = priceData?.discount?.value || 0;
    if (!descuento && precioPrevio > precioActual && precioActual > 0) {
      descuento = Math.round((1 - precioActual / precioPrevio) * 100);
    }
    if (!descuento && priceData?.discount_label?.text) {
      const md = priceData.discount_label.text.match(/(\d+)\s*%/);
      if (md) descuento = parseInt(md[1], 10);
    }

    // ── Señales de confianza + temporales (todo viene en el mismo card) ──────────
    const highlightTxt = p.components.find((c) => c.type === 'highlight')?.highlight?.text || '';
    const countdown    = p.components.find((c) => c.type === 'highlight_countdown')?.highlight_countdown;
    const sellerTxt    = p.components.find((c) => c.type === 'seller')?.seller?.text || '';
    const shippingTxt  = p.components.find((c) => c.type === 'shipping')?.shipping?.text || '';
    const marca        = p.components.find((c) => c.type === 'brand')?.brand?.text || null;

    // Limpia tokens de icono tipo "{icon_cockade}" y espacios sobrantes
    const limpiar = (s) => s.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();

    const ofertaRelampago = !!countdown && /rel[aá]mpago/i.test(countdown.text || '');
    const destacadoTxt    = countdown?.text || highlightTxt;

    const baseUrl = p.metadata.url.startsWith('http')
      ? p.metadata.url
      : `https://${p.metadata.url}`;

    return {
      id:            p.metadata.id,
      titulo:        p.components.find((c) => c.type === 'title')?.title.text,
      precio_actual: precioActual,
      precio_previo: precioPrevio || null,
      descuento:     descuento,
      rating:        reviews?.rating_average || 0,
      opiniones:     reviews?.total || 0,
      link_afiliado: `${baseUrl.split('?')[0]}?matt_tool=${MATT_TOOL}&matt_word=${MATT_WORD}`,
      imagen:        `https://http2.mlstatic.com/D_NQ_NP_${p.pictures.pictures[0]?.id}-O.webp`,
      // ── Capa de confianza + temporal (enriquecimiento propio de la web) ───────
      marca:              marca,
      destacado:          limpiar(destacadoTxt) || null,
      mas_vendido:        /m[aá]s\s+vendido/i.test(highlightTxt),
      oferta_relampago:   ofertaRelampago,
      relampago_fin:      countdown?.countdown?.period_end || null,
      vendedor:           sellerTxt ? (limpiar(sellerTxt).replace(/^Por\s+/i, '') || null) : null,
      vendedor_confiable: /cockade/i.test(sellerTxt),
      envio_gratis:       /gratis/i.test(shippingTxt),
    };
  }).filter((i) => i !== null);
}

// ════════════════════════════════════════════════════════
// PASO 3 — "Calcular Score KalidaPresio" (port del nodo Code de n8n)
//   Rating 65% · Descuento 20% (tope 40) · Volumen 15% (tope 500)
// ════════════════════════════════════════════════════════
function calcularScore(data) {
  const scoreRating     = (data.rating / 5) * 65;
  const descuentoTopado = Math.min(data.descuento || 0, 40);
  const scoreDescuento  = (descuentoTopado / 40) * 20;
  const scoreOpiniones  = Math.min((data.opiniones / 500) * 15, 15);
  return Math.round(scoreRating + scoreDescuento + scoreOpiniones);
}

// CONFIANZA (0–100): ¿qué tan respaldada está la compra? Distinto del K-P (qué tan
// buena es la oferta). Solo señales objetivas y difíciles de falsear:
//   "MÁS VENDIDO" de ML 40% · Volumen de opiniones 35% · Vendedor reputado 25%
// (Nivel Alta ≥ 80 — exigente: pide best-seller + reputación + reseñas.)
function calcularConfianza(data) {
  let c = 0;
  if (data.mas_vendido)        c += 40;
  c += Math.min((data.opiniones || 0) / 500, 1) * 35;
  if (data.vendedor_confiable) c += 25;
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

  await writeFile(OUTPUT, JSON.stringify(joyas, null, 2), 'utf-8');
  console.log(`💾  ofertas.json actualizado con ${joyas.length} productos.`);
  console.log(`🏆  Mejor: "${joyas[0].titulo?.slice(0, 50)}" (score ${joyas[0].score_kalidad_presio}).\n`);
}

main().catch((err) => {
  console.error(`\n✗ [KalidaPresio] Error: ${err.message}\n`);
  process.exit(1);
});
