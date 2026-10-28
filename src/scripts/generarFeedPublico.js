/**
 * generarFeedPublico.js — El feed que consume TODO lo que publica fuera del sitio.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * Un bot de Telegram, un flujo de n8n o las tarjetas de promoción no pueden
 * leer HTML sin volverse un scraper de tu propio sitio. Aquí hay UNA salida
 * pública, estable y versionada por `esquema`.
 *
 * ── ESQUEMA 2 (octubre 2026) ───────────────────────────────────────────────
 * La fuente es la vitrina (src/data/vitrina.json) y cada ítem lleva el link
 * OFICIAL listo para publicar:
 *
 *     enlace   → el link general, tal cual lo generaste
 *     enlaces  → { wa, tg, … } los que generaste con la etiqueta de un canal
 *     numero   → la posición en /hoy («el #3 está en mi perfil»)
 *
 * Desaparece `ruta_corta` (/r/<canal>/<id>): el sitio ya no redirige a
 * Mercado Libre desde su propio dominio ni le pega etiquetas a los links.
 *
 * Cada ítem conserva el VEREDICTO DE PRECIO contra el histórico cuando lo
 * hay. `alto` = estuvo más barato hace poco; `descuento-falso` = el precio no
 * se movió y aun así se anuncia rebaja. Ese dato viaja para que cualquier
 * publicador pueda negarse a anunciarlo.
 *
 * ── NO SE VERSIONA ─────────────────────────────────────────────────────────
 * Es un derivado: cada build lo regenera desde la vitrina + histórico.
 *
 * Ejecutar:  npm run generar-feed   (o automático dentro de `npm run build`)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categorizar } from '../utils/categorias.js';
import { resumirHistorico, veredictoPrecio, NIVELES_NO_DISTRIBUIBLES } from '../utils/historico.js';
import { ordenParaPublicar } from '../utils/vitrina.js';
import { leerVitrina } from './vitrinaDisco.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORICO = path.resolve(__dirname, '../data/historico-precios.json');
const SALIDA_DIR = path.resolve(__dirname, '../../public/data');
const SALIDA = path.resolve(SALIDA_DIR, 'feed.json');

/**
 * Versión del esquema. Súbela si CAMBIA o DESAPARECE un campo; los consumidores
 * (n8n, bots) la comprueban y se niegan a publicar con un formato que no
 * entienden, en vez de mandar mensajes con campos vacíos.
 */
const ESQUEMA = 2;

const SITIO = (process.env.SITE_URL || 'https://kalidapresio.albis-labs.xyz').replace(/\/+$/, '');

function leerJson(ruta, porDefecto) {
  if (!existsSync(ruta)) return porDefecto;
  try {
    return JSON.parse(readFileSync(ruta, 'utf-8'));
  } catch {
    return porDefecto;
  }
}

const { productos, descartes } = leerVitrina();
const productosHist = leerJson(HISTORICO, { productos: {} }).productos ?? {};

// El MISMO orden que /hoy: el número de cada ítem es su posición ahí.
const items = ordenParaPublicar(productos).map((o, i) => {
  const v = veredictoPrecio(o.precio_actual, resumirHistorico(productosHist[o.id]), { descuento: o.descuento });
  return {
    id: o.id,
    numero: i + 1,
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
    nota: o.nota ?? null,
    relampago: Boolean(o.oferta_relampago),
    termina: o.fin_oferta ?? null,
    caduca: o.caduca ?? null,
    revisado: o.revisado,
    enlace: o.link_afiliado,
    enlaces: o.enlaces ?? {},
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
  total: items.length,
  items,
}, null, 0) + '\n', 'utf-8');

// Ni los que han estado más baratos ni los que anuncian un descuento que no
// existe. NIVELES_NO_DISTRIBUIBLES es la fuente única: ver src/utils/historico.js.
const publicables = items.filter((i) => !NIVELES_NO_DISTRIBUIBLES.includes(i.historico.nivel)).length;

console.log(`✅ [feed] ${items.length} productos de la vitrina en public/data/feed.json (esquema ${ESQUEMA}).`);
console.log(`   ${publicables}/${items.length} publicables según el histórico de precios.`);
if (descartes.length) console.log(`   ${descartes.length} fuera de la publicación (revisa /panel/agregar).`);
