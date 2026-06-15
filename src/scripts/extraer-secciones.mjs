// src/scripts/extraer-secciones.mjs
// KalidaPresio — PROTOTIPO de sondeo: ¿cuáles de las 4 secciones de /ofertas
// rinden productos extraíbles con la fórmula base (appProps → items)?
//
//   - Fetch SECUENCIAL con delay aleatorio 1.5–3 s (respetuoso, anti-detección).
//   - Extractor ADAPTATIVO: regex base → variantes → diagnóstico (nunca truena
//     sin decirte QUÉ estructura encontró).
//   - Dedup por id across secciones (campo `secciones` es ARRAY acumulativo).
//   - Score/filtro: COPIA 1:1 del pipeline existente (importarOfertas.js),
//     aplicado DESPUÉS del dedup. Marcado como hook por si el original cambia.
//   - Salida: src/data/secciones-prueba.json (NO toca ofertas.json).
//
// Ejecutar:  node src/scripts/extraer-secciones.mjs
// Requiere:  Node.js >= 22 (fetch nativo, loadEnvFile). Solo build-time/local:
//            NUNCA correr esto en el navegador (ML no da CORS).

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Credenciales de afiliado (de .env; NO hardcodear MATT_TOOL) ──────────────
try {
  process.loadEnvFile(path.resolve(__dirname, '../../.env'));
} catch { /* sin .env: process.env del entorno */ }

const MATT_TOOL = process.env.ML_MATT_TOOL;
const MATT_WORD = process.env.ML_MATT_WORD || 'ci20241127172754';
if (!MATT_TOOL) {
  console.warn('⚠  ML_MATT_TOOL no está en el entorno. Los link_afiliado saldrán SIN matt_tool (solo prototipo).');
}

const OUTPUT = path.resolve(__dirname, '../data/secciones-prueba.json');

// ════════════════════════════════════════════════════════
// LAS 4 URLS A SONDEAR
// (relampago y menos-500 comparten container → habrá solape; lo absorbe el dedup)
// ════════════════════════════════════════════════════════
const SECCIONES = [
  { nombre: 'relampago',   url: 'https://www.mercadolibre.com.mx/ofertas?container_id=MLM779363-1&promotion_type=lightning' },
  { nombre: 'imbatibles',  url: 'https://www.mercadolibre.com.mx/ofertas?container_id=MLM1321208-1&deal_ids=MLM1321208' },
  { nombre: 'liquidacion', url: 'https://www.mercadolibre.com.mx/ofertas?container_id=MLM1297614-1&deal_ids=MLM27723' },
  { nombre: 'menos-500',   url: 'https://www.mercadolibre.com.mx/ofertas?container_id=MLM779363-1&price=0.0-500.0' },
];

// ── Headers tipo Chrome real (fórmula base, ampliada) ────────────────────────
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const delayAleatorio = () => 1500 + Math.round(Math.random() * 1500); // 1.5–3 s

// ════════════════════════════════════════════════════════
// EXTRACCIÓN ADAPTATIVA DEL ESTADO EMBEBIDO
// ════════════════════════════════════════════════════════

/**
 * Recorta un objeto JSON balanceado a partir de un índice de apertura '{'.
 * (Variante robusta cuando el ancla ",\"mainEntry\"" no existe.)
 */
function recortarJsonBalanceado(html, desde) {
  let depth = 0, enString = false, escape = false;
  for (let i = desde; i < html.length; i++) {
    const ch = html[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { enString = !enString; continue; }
    if (enString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return html.slice(desde, i + 1); }
  }
  return null;
}

/**
 * Intenta extraer el objeto de estado con la fórmula base y variantes.
 * Devuelve { estado, metodo } o { estado: null, diagnostico } — nunca lanza.
 */
function extraerEstado(html) {
  // 1) FÓRMULA BASE (la que ya funciona en /ofertas)
  const base = html.match(/"appProps":({.*?}),"mainEntry"/s);
  if (base) {
    try { return { estado: JSON.parse(base[1]), metodo: 'regex base (appProps→mainEntry)' }; }
    catch { /* JSON cortado por el lazy match: cae a la variante balanceada */ }
  }

  // 2) Variante: mismo ancla "appProps" pero recorte por llaves balanceadas
  const idxApp = html.indexOf('"appProps":');
  if (idxApp !== -1) {
    const blob = recortarJsonBalanceado(html, html.indexOf('{', idxApp));
    if (blob) {
      try { return { estado: JSON.parse(blob), metodo: 'appProps balanceado' }; }
      catch { /* sigue */ }
    }
  }

  // 3) Variante: <script id="__NEXT_DATA__" type="application/json">
  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>({.*?})<\/script>/s);
  if (next) {
    try { return { estado: JSON.parse(next[1]), metodo: '__NEXT_DATA__' }; }
    catch { /* sigue */ }
  }

  // 4) Variante: window.__PRELOADED_STATE__ = {...};
  const pre = html.indexOf('__PRELOADED_STATE__');
  if (pre !== -1) {
    const blob = recortarJsonBalanceado(html, html.indexOf('{', pre));
    if (blob) {
      try { return { estado: JSON.parse(blob), metodo: '__PRELOADED_STATE__' }; }
      catch { /* sigue */ }
    }
  }

  // ── DIAGNÓSTICO: nada matcheó. Enséñame qué estructura SÍ hay. ────────────
  const diagnostico = [];
  // ¿Hay algún <script> con JSON grande? Reporta sus claves de nivel superior.
  const scripts = [...html.matchAll(/<script[^>]*>\s*({.{200,}?})\s*<\/script>/gs)].slice(0, 3);
  for (const [, blob] of scripts) {
    try {
      const obj = JSON.parse(blob);
      diagnostico.push(`claves de un <script> JSON: [${Object.keys(obj).slice(0, 12).join(', ')}]`);
    } catch { /* no era JSON parseable */ }
  }
  diagnostico.push(`fragmento HTML (0–400): ${html.slice(0, 400).replace(/\s+/g, ' ')}`);
  const idxItems = html.indexOf('"items"');
  if (idxItems !== -1) {
    diagnostico.push(`…alrededor de "items" (${idxItems}): ${html.slice(idxItems - 80, idxItems + 200).replace(/\s+/g, ' ')}`);
  }
  return { estado: null, diagnostico };
}

/**
 * Localiza el array de items de forma resiliente.
 * 1º la ruta conocida pageProps.data.items (y la variante de __NEXT_DATA__),
 * después búsqueda recursiva del primer array de objetos con 'card' o 'metadata'.
 * Devuelve { items, ruta } o { items: null }.
 */
function encontrarItems(estado) {
  const directas = [
    ['pageProps.data.items', estado?.pageProps?.data?.items],
    ['props.pageProps.data.items', estado?.props?.pageProps?.data?.items],
  ];
  for (const [ruta, arr] of directas) {
    if (Array.isArray(arr) && arr.length) return { items: arr, ruta };
  }

  // Búsqueda recursiva (BFS) del primer array "con cara de productos"
  const cola = [[estado, '$']];
  let visitados = 0;
  while (cola.length && visitados < 20000) {
    const [nodo, ruta] = cola.shift();
    visitados++;
    if (Array.isArray(nodo)) {
      if (nodo.length && nodo.every((x) => x && typeof x === 'object') &&
          nodo.some((x) => 'card' in x || 'metadata' in x)) {
        return { items: nodo, ruta: `${ruta} (recursiva)` };
      }
      nodo.forEach((v, i) => { if (v && typeof v === 'object') cola.push([v, `${ruta}[${i}]`]); });
    } else if (nodo && typeof nodo === 'object') {
      for (const [k, v] of Object.entries(nodo)) {
        if (v && typeof v === 'object') cola.push([v, `${ruta}.${k}`]);
      }
    }
  }
  return { items: null, ruta: null };
}

// ════════════════════════════════════════════════════════
// PARSEO POR ITEM (fórmula base, tolerante a campos faltantes)
// ════════════════════════════════════════════════════════

/** Normaliza a ISO 8601 o null (sin inventar). */
function aISO(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Extrae un producto de un item crudo. NO falsea: campo ausente → 0/null y se
 * cuenta en `faltantes` (Map sección→contador) para el reporte.
 */
function extraerItem(item, seccion, faltantes) {
  const p = item.card ?? item; // adaptativo: algunos feeds traen el card "plano"
  const comps = Array.isArray(p?.components) ? p.components : [];
  const comp = (t) => comps.find((c) => c.type === t);
  const cuenta = (campo) => faltantes.set(campo, (faltantes.get(campo) || 0) + 1);

  const id = p?.metadata?.id ?? null;
  if (!id) { cuenta('sin id (item descartado)'); return null; }

  const reviews = comp('reviews')?.reviews;
  const priceData = comp('price')?.price;

  // Descuento REAL (la fórmula base: discount.value → previous_price → label)
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

  const highlightTxt = comp('highlight')?.highlight?.text || '';
  const countdown = comp('highlight_countdown')?.highlight_countdown;
  const sellerTxt = comp('seller')?.seller?.text || '';
  const shippingTxt = comp('shipping')?.shipping?.text || '';
  const limpiar = (s) => s.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();

  // FIN DE OFERTA (clave para relámpago): ruta conocida y, si no, cualquier
  // componente que traiga un countdown con period_end.
  let finRaw = countdown?.countdown?.period_end ?? null;
  if (!finRaw) {
    const otro = comps.find((c) => c?.[c.type]?.countdown?.period_end);
    finRaw = otro ? otro[otro.type].countdown.period_end : null;
  }
  const finOferta = aISO(finRaw);

  // Contadores de faltantes (para el reporte, no para tronar)
  if (!reviews || !reviews.total) cuenta('sin reviews');
  if (!precioActual) cuenta('sin precio');
  if (!p?.pictures?.pictures?.[0]?.id) cuenta('sin imagen');
  if (!descuento) cuenta('sin descuento');
  if (seccion === 'relampago' && !finOferta) cuenta('relámpago sin fin_oferta');

  const urlCruda = p?.metadata?.url || '';
  const baseUrl = urlCruda.startsWith('http') ? urlCruda : `https://${urlCruda}`;
  const afiliado = MATT_TOOL
    ? `${baseUrl.split('?')[0]}?matt_tool=${MATT_TOOL}&matt_word=${MATT_WORD}`
    : baseUrl.split('?')[0];

  return {
    id,
    titulo: comp('title')?.title?.text ?? null,
    precio_actual: precioActual,
    precio_previo: precioPrevio || null,
    descuento,
    rating: reviews?.rating_average || 0,
    opiniones: reviews?.total || 0,
    link_afiliado: afiliado,
    imagen: p?.pictures?.pictures?.[0]?.id
      ? `https://http2.mlstatic.com/D_NQ_NP_${p.pictures.pictures[0].id}-O.webp`
      : null,
    marca: comp('brand')?.brand?.text || null,
    destacado: limpiar(countdown?.text || highlightTxt) || null,
    mas_vendido: /m[aá]s\s+vendido/i.test(highlightTxt),
    oferta_relampago: (!!countdown && /rel[aá]mpago/i.test(countdown.text || '')) || seccion === 'relampago',
    fin_oferta: finOferta,            // ISO 8601 o null — para el auto-refresh del carrusel
    vendedor: sellerTxt ? (limpiar(sellerTxt).replace(/^Por\s+/i, '') || null) : null,
    vendedor_confiable: /cockade/i.test(sellerTxt),
    envio_gratis: /gratis/i.test(shippingTxt),
    secciones: [seccion],             // ARRAY: el dedup acumula aquí
  };
}

// ════════════════════════════════════════════════════════
// HOOK: SCORE + FILTRO EXISTENTES
// Copia 1:1 de src/scripts/importarOfertas.js (el algoritmo NO se inventa aquí;
// si cambias el original, replica el cambio o expórtalo y impórtalo).
// ════════════════════════════════════════════════════════
const PRECIO_MINIMO = 200;
const SCORE_MINIMO = 70;

function calcularScore(data) {
  const scoreRating = (data.rating / 5) * 65;
  const descuentoTopado = Math.min(data.descuento || 0, 40);
  const scoreDescuento = (descuentoTopado / 40) * 20;
  const scoreOpiniones = Math.min((data.opiniones / 500) * 15, 15);
  return Math.round(scoreRating + scoreDescuento + scoreOpiniones);
}

function calcularConfianza(data) {
  let c = 0;
  if (data.mas_vendido) c += 40;
  c += Math.min((data.opiniones || 0) / 500, 1) * 35;
  if (data.vendedor_confiable) c += 25;
  return Math.round(Math.min(c, 100));
}

function evaluarYFiltrar(items) {
  return items
    .map((data) => {
      if (data.precio_actual < PRECIO_MINIMO || data.rating === 0) return null;
      return { ...data, score_kalidad_presio: calcularScore(data), confianza: calcularConfianza(data) };
    })
    .filter((i) => i !== null)
    .filter((i) => i.score_kalidad_presio >= SCORE_MINIMO)
    .sort((a, b) => b.score_kalidad_presio - a.score_kalidad_presio || b.confianza - a.confianza);
}
// ════════════════════════ fin del hook ════════════════════════

// ════════════════════════════════════════════════════════
// MAIN — sondeo secuencial + dedup + reporte
// ════════════════════════════════════════════════════════
async function main() {
  console.log('\n🛰  [KalidaPresio] Sondeo de 4 secciones de /ofertas (prototipo)\n');

  const porId = new Map();   // dedup global: id → producto fusionado
  const reporte = [];        // una fila por URL

  for (const { nombre, url } of SECCIONES) {
    const fila = {
      seccion: nombre, regexBase: '—', metodo: '—', rutaItems: '—',
      crudos: 0, trasFiltro: 0, faltantes: '—', fin_oferta: nombre === 'relampago' ? 'no' : 'n/a',
    };
    reporte.push(fila);

    console.log(`→ ${nombre}: ${url}`);
    let html;
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      if (!res.ok) { console.error(`  ✗ HTTP ${res.status} — sección omitida.`); fila.metodo = `HTTP ${res.status}`; continue; }
      html = await res.text();
    } catch (e) {
      console.error(`  ✗ fetch falló: ${e.message} — sección omitida.`);
      fila.metodo = `fetch: ${e.message}`;
      continue;
    } finally {
      // Delay SIEMPRE entre peticiones (también tras un fallo): 1.5–3 s
      if (nombre !== SECCIONES.at(-1).nombre) await dormir(delayAleatorio());
    }

    const { estado, metodo, diagnostico } = extraerEstado(html);
    if (!estado) {
      console.error(`  ✗ Ninguna variante extrajo el estado. DIAGNÓSTICO:`);
      diagnostico.forEach((d) => console.error(`    · ${d}`));
      fila.regexBase = 'no';
      fila.metodo = 'sin estado (ver diagnóstico)';
      continue;
    }
    fila.regexBase = metodo.startsWith('regex base') ? 'sí' : 'no';
    fila.metodo = metodo;

    const { items, ruta } = encontrarItems(estado);
    if (!items) {
      console.error(`  ✗ Estado extraído (${metodo}) pero SIN array de items. Claves raíz: [${Object.keys(estado).slice(0, 12).join(', ')}]`);
      fila.rutaItems = 'NO ENCONTRADA';
      continue;
    }
    fila.rutaItems = ruta;

    const faltantes = new Map();
    const productos = items.map((it) => extraerItem(it, nombre, faltantes)).filter(Boolean);
    fila.crudos = productos.length;
    fila.faltantes = faltantes.size
      ? [...faltantes].map(([k, v]) => `${k}: ${v}/${productos.length}`).join(' · ')
      : 'ninguno';
    if (nombre === 'relampago') {
      const conFin = productos.filter((x) => x.fin_oferta).length;
      fila.fin_oferta = conFin ? `sí (${conFin}/${productos.length})` : 'NO ⚠';
    }

    // Dedup/fusión: mismo id en varias secciones → un registro, secciones acumuladas
    for (const prod of productos) {
      const previo = porId.get(prod.id);
      if (previo) {
        if (!previo.secciones.includes(nombre)) previo.secciones.push(nombre);
        previo.fin_oferta = previo.fin_oferta ?? prod.fin_oferta;
        previo.oferta_relampago = previo.oferta_relampago || prod.oferta_relampago;
      } else {
        porId.set(prod.id, prod);
      }
    }
    console.log(`  ✓ ${productos.length} crudos (${metodo}; items en ${ruta})`);
  }

  // ── Score + filtro (hook existente) DESPUÉS del dedup ──────────────────────
  const combinados = [...porId.values()];
  const finales = evaluarYFiltrar(combinados);

  // "tras filtro" por sección (un producto puede contar en varias)
  for (const fila of reporte) {
    fila.trasFiltro = finales.filter((p) => p.secciones.includes(fila.seccion)).length;
  }

  await writeFile(OUTPUT, JSON.stringify(finales, null, 2), 'utf-8');

  // ── REPORTE ────────────────────────────────────────────────────────────────
  console.log('\n════════ REPORTE POR URL ════════');
  console.table(reporte.map(({ seccion, regexBase, metodo, rutaItems, crudos, trasFiltro, faltantes, fin_oferta }) =>
    ({ seccion, 'regex base': regexBase, 'método': metodo, 'ruta items': rutaItems, crudos, 'tras filtro': trasFiltro, faltantes, fin_oferta })));

  const multiSeccion = finales.filter((p) => p.secciones.length > 1).length;
  console.log(`\nΣ Global: ${combinados.length} únicos tras dedup → ${finales.length} tras score/filtro.`);
  console.log(`  Productos en MÁS de una sección: ${multiSeccion} (solape esperado relampago/menos-500).`);
  console.log(`💾 Prototipo escrito en src/data/secciones-prueba.json (producción intacta).\n`);
}

main().catch((err) => {
  console.error(`\n✗ [extraer-secciones] Error inesperado: ${err.message}\n`);
  process.exit(1);
});
