/**
 * secciones — Colecciones de datos POR SECCIÓN para el sitio (build-time).
 *
 * Fuente: src/data/secciones-feed.json (lo escribe extraer-secciones.mjs;
 * el hook de astro.config lo refresca al inicio de cada build).
 *
 * ── FRESCURA (la regla que evita servir precios muertos) ───────────────────
 * El archivo se acepta SOLO si viene con sobre `{ generadoEl, items }` y ese
 * sello tiene menos de MAX_EDAD_HORAS. Cualquier otra cosa —archivo ausente,
 * corrupto, array pelón sin fecha, o sellado hace demasiado tiempo— se
 * descarta y degradamos a ofertas.json, que el bot de GitHub Actions refresca
 * cada 3 h y por tanto SIEMPRE está más fresco que un extractor que falló.
 *
 * Por qué es así: antes el único criterio era "existe y no está vacío". Si el
 * extractor dejaba de funcionar (ML bloquea la IP del VPS, cambia el HTML…),
 * el JSON viejo se quedaba en su sitio y la portada seguía sirviéndolo sin que
 * nada avisara. Pasó: 58 días de precios de junio en producción.
 *
 * El fallback a ofertas.json reparte:
 *   · relampago  ← items con oferta_relampago (su relampago_fin → fin_oferta)
 *   · imbatibles ← el resto del catálogo (para que el grid no quede vacío)
 *
 * Este módulo corre SOLO en Node durante el build (lo importan los
 * frontmatter de .astro). Nada de esto llega al navegador como JS.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { OFERTAS as ofertasProduccion, GENERADO_EL as GENERADO_OFERTAS } from './ofertas.js';
import { calcularScorePorSeccion } from '../utils/scoreSecciones.js';

/** Ventana de confianza del feed seccionado. Más viejo que esto → se ignora. */
const MAX_EDAD_HORAS = 12;

/**
 * Devuelve { items, generadoEl } si el feed seccionado es utilizable y fresco;
 * si no, { items: null, motivo } para que el caller degrade y lo loguee.
 */
function cargarSecciones() {
  // OJO: en `astro build` este módulo corre EMPAQUETADO (import.meta.url
  // apunta a dist/chunks/, no a src/data/). Por eso la ruta primaria se
  // resuelve desde la raíz del proyecto (cwd del build); la URL relativa
  // queda como respaldo para contextos donde el módulo no se reubica.
  const candidatos = [
    path.resolve(process.cwd(), 'src/data/secciones-feed.json'),
    new URL('./secciones-feed.json', import.meta.url),
  ];

  let ultimoMotivo = 'no se encontró src/data/secciones-feed.json';

  for (const ruta of candidatos) {
    let datos;
    try {
      datos = JSON.parse(readFileSync(ruta, 'utf-8'));
    } catch {
      continue; // no existe o no parsea → siguiente candidato
    }

    // Un array pelón es el formato viejo: no trae fecha, así que no hay forma
    // de saber si es de hoy o de hace dos meses. No se acepta.
    if (Array.isArray(datos)) {
      ultimoMotivo = 'formato antiguo sin sello de fecha (array sin `generadoEl`)';
      continue;
    }

    const items = Array.isArray(datos?.items) ? datos.items : null;
    if (!items || items.length === 0) {
      ultimoMotivo = 'el sobre no trae `items` utilizables';
      continue;
    }

    const sello = Date.parse(datos?.generadoEl ?? '');
    if (Number.isNaN(sello)) {
      ultimoMotivo = '`generadoEl` ausente o no es una fecha válida';
      continue;
    }

    const edadHoras = (Date.now() - sello) / 3_600_000;
    if (edadHoras > MAX_EDAD_HORAS) {
      ultimoMotivo = `el feed tiene ${edadHoras.toFixed(1)} h (máximo ${MAX_EDAD_HORAS} h)`;
      continue;
    }

    return { items, generadoEl: datos.generadoEl, edadHoras };
  }

  return { items: null, motivo: ultimoMotivo };
}

const cargado = cargarSecciones();
const seccionado = cargado.items;

/** true si estamos sirviendo el fallback de ofertas.json (sin extractor fresco). */
export const ES_FALLBACK = seccionado === null;

/**
 * Marca de tiempo de los datos que se están sirviendo REALMENTE (ISO 8601).
 * Con el feed seccionado, su sello; en fallback, el de ofertas.json. `null`
 * solo si ninguno de los dos lo trae — y en ese caso el sitio lo admite en
 * voz alta en vez de inventarse una fecha.
 */
export const GENERADO_EL = ES_FALLBACK ? GENERADO_OFERTAS : cargado.generadoEl;

// El build debe DECIR de dónde salen los datos. Un fallback silencioso es lo
// que dejó la portada dos meses en junio.
if (ES_FALLBACK) {
  console.warn(
    `⚠ [secciones] Feed seccionado descartado (${cargado.motivo}). ` +
    `Sirviendo ofertas.json (${ofertasProduccion.length} items del bot de 3 h).`,
  );
} else {
  console.log(`✅ [secciones] Feed seccionado fresco: ${seccionado.length} items, ${cargado.edadHoras.toFixed(1)} h de antigüedad.`);
}

// ── Normalización: ambas fuentes acaban con el MISMO shape ──────────────────
// (fin_oferta es el nombre canónico nuevo; relampago_fin se mantiene como
// espejo para que TarjetaOferta y los countdowns existentes sigan funcionando)
const normalizar = (it) => ({
  ...it,
  fin_oferta: it.fin_oferta ?? it.relampago_fin ?? null,
  relampago_fin: it.relampago_fin ?? it.fin_oferta ?? null,
  secciones: it.secciones ?? (it.oferta_relampago ? ['relampago'] : ['imbatibles']),
});

const base = (seccionado ?? ofertasProduccion).map(normalizar);
const ahora = Date.now();

/**
 * RELÁMPAGO — pesos estándar (el score global del JSON ya los usa).
 * Pre-filtro de build: lo ya vencido ni se renderiza; lo que venza después
 * del build lo retira el cliente (initRelampago en Layout).
 */
export const ALL_RELAMPAGO = base
  .filter((it) => it.secciones.includes('relampago'))
  .filter((it) => !it.fin_oferta || new Date(it.fin_oferta).getTime() > ahora)
  .sort((a, b) => (b.score_kalidad_presio ?? 0) - (a.score_kalidad_presio ?? 0));

/**
 * IMBATIBLES — score RECALIBRADO (65/10/25: el volumen compensa la falta de
 * descuento). Un solo campo persistido (score_kalidad_presio global); el
 * seccional vive solo aquí como `score_seccion` y ordena/se muestra en el grid.
 */
/**
 * Mínimo para que la rejilla de la portada valga la pena. Por debajo se
 * completa con el resto del catálogo fresco.
 *
 * POR QUÉ: el contenedor "imbatibles" de ML es caprichoso — en una lectura del
 * 2026-08-20 rendía 3 productos mientras los otros tres contenedores daban 91.
 * Sin este suelo pasaba algo absurdo: con el extractor CAÍDO la portada
 * mostraba 41 tarjetas (fallback a ofertas.json) y con el extractor FUNCIONANDO
 * mostraba 3. El éxito no puede empeorar el sitio.
 */
const MIN_IMBATIBLES = 12;

const imbatiblesEstrictos = base.filter((it) => it.secciones.includes('imbatibles'));

// Si la sección viene famélica, se completa con el resto del catálogo (todo
// menos relámpago, que tiene su propio carrusel). Es la misma regla que ya
// aplica el fallback a ofertas.json, escrita arriba: que el grid no quede vacío.
const fuenteImbatibles = imbatiblesEstrictos.length >= MIN_IMBATIBLES
  ? imbatiblesEstrictos
  : base.filter((it) => !it.secciones.includes('relampago'));

if (!ES_FALLBACK && imbatiblesEstrictos.length < MIN_IMBATIBLES) {
  console.warn(
    `⚠ [secciones] El contenedor "imbatibles" solo trajo ${imbatiblesEstrictos.length} items ` +
    `(mínimo ${MIN_IMBATIBLES}). La rejilla se completa con el resto del catálogo: ${fuenteImbatibles.length}.`,
  );
}

/**
 * true si la rejilla se rellenó con el resto del catálogo porque el contenedor
 * "imbatibles" de ML venía famélico. La portada lo usa para NO titular
 * "Precios imbatibles" un montón que incluye liquidación: si el contenido
 * cambia, el encabezado cambia con él.
 */
/**
 * Los imbatibles ESTRICTOS: solo lo que ML puso en ese contenedor, sin rellenar.
 * La portada puede completar su rejilla para no quedarse en tres tarjetas, pero
 * la página dedicada tiene que enseñar lo que su título promete y nada más.
 */
export const ALL_IMBATIBLES_ESTRICTOS = imbatiblesEstrictos
  .map((it) => ({ ...it, score_seccion: calcularScorePorSeccion(it, 'imbatibles') }))
  .sort((a, b) => b.score_seccion - a.score_seccion);

export const IMBATIBLES_COMPLETADO = !ES_FALLBACK && imbatiblesEstrictos.length < MIN_IMBATIBLES;

export const ALL_IMBATIBLES = fuenteImbatibles
  .map((it) => ({ ...it, score_seccion: calcularScorePorSeccion(it, 'imbatibles') }))
  .sort((a, b) => b.score_seccion - a.score_seccion);

// Liquidación y menos-500 usan los pesos estándar (65/20/25 es solo para
// imbatibles, donde ML no manda previous_price). Se ordenan igual que el resto.
const porScore = (seccion) => base
  .filter((it) => it.secciones.includes(seccion))
  .map((it) => ({ ...it, score_seccion: calcularScorePorSeccion(it, 'default') }))
  .sort((a, b) => b.score_seccion - a.score_seccion);

export const ALL_LIQUIDACION = porScore('liquidacion');
export const ALL_MENOS_500 = porScore('menos-500');

/**
 * Las secciones que tienen PÁGINA PROPIA (/ofertas/<slug>).
 *
 * Relámpago queda fuera a propósito: son ofertas por tiempo limitado y ML dejó
 * de publicar su fecha de fin (2026), así que una página estática reconstruida
 * cada pocas horas las presentaría como vigentes sin poder garantizarlo. Para
 * eso está el carrusel, que se refresca en el navegador.
 *
 * `campana` alimenta el sufijo de matt_word: es la MISMA etiqueta que verás en
 * el panel de afiliados de ML y en Umami, así que las tres vistas cuadran.
 */
export const SECCIONES_CON_PAGINA = [
  {
    slug: 'imbatibles',
    campana: 'imbatibles',
    emoji: '💪',
    titulo: 'Precios imbatibles',
    resumen: 'precio permanente bajo, ordenados por calidad real',
    descripcion:
      'Productos con precio permanente bajo en Mercado Libre México, ordenados por el Sello K-P: calificación real de compradores, descuento verificado y volumen de ventas.',
    items: ALL_IMBATIBLES_ESTRICTOS,
  },
  {
    slug: 'liquidacion',
    campana: 'liquidacion',
    emoji: '🏷️',
    titulo: 'Liquidación',
    resumen: 'salida de inventario: los descuentos más agresivos del catálogo',
    descripcion:
      'Ofertas de liquidación en Mercado Libre México. Salida de inventario con los descuentos más agresivos, filtradas por el Sello K-P para que barato no signifique malo.',
    items: ALL_LIQUIDACION,
  },
  {
    slug: 'menos-500',
    campana: 'menos500',
    emoji: '💵',
    titulo: 'Por menos de $500',
    resumen: 'lo mejor que se puede comprar con poco presupuesto',
    descripcion:
      'Las mejores ofertas calidad-precio por menos de $500 pesos en Mercado Libre México. Presupuesto ajustado sin renunciar a la calidad, según el Sello K-P.',
    items: ALL_MENOS_500,
  },
// Una página con cuatro productos no le sirve a nadie ni rankea, y encima
// diluye el rastreo del resto del sitio. Si una sección viene famélica,
// simplemente no tiene página ese día — y la portada tampoco la enlaza.
].filter((s) => s.items.length >= 8);
