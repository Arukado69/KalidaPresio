/**
 * generarFeedPublico.js — El feed que consume TODO lo que publica fuera del sitio.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * `ofertas.json` vive en el repo y el sitio lo hornea en HTML. Eso sirve para
 * la página, pero un bot de Telegram, un flujo de n8n o un futuro Pinterest no
 * pueden leer HTML sin volverse un scraper de tu propio sitio. Sin este archivo,
 * cada superficie nueva se inventa su propia forma de enterarse — y cuando el
 * feed cambie de forma, se rompen todas a la vez y en silencio.
 *
 * Aquí hay UNA salida pública, estable y versionada por `esquema`.
 *
 * ── LO QUE LO HACE DISTINTO DE UN FEED DE OFERTAS CUALQUIERA ───────────────
 * Cada ítem lleva el VEREDICTO DE PRECIO calculado contra el histórico:
 *
 *     historico.nivel = 'minimo' | 'bajo' | 'normal' | 'alto' | 'siguiendo' | 'sin-datos'
 *
 * `alto` significa que el producto ESTUVO MÁS BARATO hace poco: el «descuento»
 * es contra un precio inflado. Ese dato viaja en el feed a propósito, para que
 * cualquier publicador pueda negarse a anunciarlo. Es la única razón por la que
 * alguien seguiría este canal y no los otros veinte que copian las mismas
 * ofertas — y se pierde entera el día que se publique un descuento falso.
 *
 * ── NO SE VERSIONA ─────────────────────────────────────────────────────────
 * Es un derivado: cada build lo regenera desde ofertas.json + histórico.
 *
 * Ejecutar:  npm run generar-feed   (o automático dentro de `npm run build`)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categorizar } from '../utils/categorias.js';
import { resumirHistorico, veredictoPrecio } from '../utils/historico.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEED = path.resolve(__dirname, '../data/ofertas.json');
const HISTORICO = path.resolve(__dirname, '../data/historico-precios.json');
const SALIDA_DIR = path.resolve(__dirname, '../../public/data');
const SALIDA = path.resolve(SALIDA_DIR, 'feed.json');

/**
 * Versión del esquema. Súbela si CAMBIA o DESAPARECE un campo; los consumidores
 * (n8n, bots) pueden comprobarla y negarse a publicar con un formato que no
 * entienden, en vez de mandar mensajes con campos vacíos.
 */
const ESQUEMA = 1;

const SITIO = (process.env.SITE_URL || 'https://kalidapresio.albis-labs.xyz').replace(/\/+$/, '');

function leerJson(ruta, porDefecto) {
  if (!existsSync(ruta)) return porDefecto;
  try {
    return JSON.parse(readFileSync(ruta, 'utf-8'));
  } catch {
    return porDefecto;
  }
}

const crudo = leerJson(FEED, null);
const ofertas = Array.isArray(crudo) ? crudo : (crudo?.items ?? []);
if (!Array.isArray(ofertas) || ofertas.length === 0) {
  console.error('❌ [feed] ofertas.json vacío o ilegible. No se genera nada.');
  process.exit(1);
}

const productosHist = leerJson(HISTORICO, { productos: {} }).productos ?? {};

const items = ofertas
  .filter((o) => o?.id && o?.titulo && Number.isFinite(o.precio_actual))
  .map((o) => {
    const resumen = resumirHistorico(productosHist[o.id]);
    const v = veredictoPrecio(o.precio_actual, resumen);
    return {
      id: o.id,
      titulo: o.titulo,
      categoria: categorizar(o.titulo),
      precio_actual: o.precio_actual,
      precio_previo: o.precio_previo ?? null,
      descuento: o.descuento ?? null,
      score: o.score_kalidad_presio ?? null,
      rating: o.rating ?? null,
      vendidos: o.vendidos ?? null,
      envio_gratis: Boolean(o.envio_gratis),
      cupon: o.cupon ?? null,
      imagen: o.imagen ?? null,
      // El enlace corto se arma con el canal de quien publica: no se puede
      // precalcular aquí sin repetirlo ocho veces. La base va en `sitio`.
      ruta_corta: `/r/{canal}/${o.id}`,
      historico: {
        nivel: v.nivel,
        texto: v.texto,
        dias: v.dias,
        minimo: v.minimo,
      },
    };
  });

if (!existsSync(SALIDA_DIR)) mkdirSync(SALIDA_DIR, { recursive: true });

writeFileSync(SALIDA, JSON.stringify({
  esquema: ESQUEMA,
  sitio: SITIO,
  generadoEl: new Date().toISOString(),
  // Sello del FEED, no del build: dice qué tan viejos son los precios, que es
  // lo que un publicador necesita saber antes de anunciarlos.
  feedGeneradoEl: crudo?.generadoEl ?? null,
  total: items.length,
  items,
}, null, 0) + '\n', 'utf-8');

const porNivel = items.reduce((acc, i) => {
  acc[i.historico.nivel] = (acc[i.historico.nivel] ?? 0) + 1;
  return acc;
}, {});
const publicables = items.filter((i) => i.historico.nivel !== 'alto').length;

console.log(`✅ [feed] ${items.length} ofertas en public/data/feed.json (esquema ${ESQUEMA}).`);
console.log(`   Veredicto de precio: ${Object.entries(porNivel).map(([k, n]) => `${k}=${n}`).join(' · ')}`);
console.log(`   ${publicables}/${items.length} publicables (los "alto" han estado más baratos: no se anuncian).`);
