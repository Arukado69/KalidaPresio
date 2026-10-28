/**
 * generarRelampago.js — Genera public/data/relampago.json desde la vitrina.
 *
 * El carrusel Relámpago (y el hero que rota) se alimentan de este JSON en el
 * navegador, que retira cada oferta al vencer sin necesidad de rebuild.
 *
 * ── QUÉ CAMBIÓ ─────────────────────────────────────────────────────────────
 * Antes tomaba las 8 ofertas con más descuento del feed raspado y les ponía
 * un `endsAt` de +24 h desde el build: una cuenta regresiva inventada, sobre
 * links armados a mano. Ahora entran SOLO las que marcaste como relámpago en
 * src/data/vitrina.json, con tu link oficial:
 *   · con `termina` → cuenta regresiva real hasta esa hora;
 *   · sin `termina` → sin cuenta regresiva; se retira sola al `caduca`
 *     (HORAS_RELAMPAGO_SIN_FIN después de que viste el precio).
 *
 * El schema de salida es el que espera initRelampagoFetch() en Layout:
 *   { detectadoEl, ofertas: [{ id, titulo, precioActual, precioOriginal,
 *     descuentoReal, scoreKP, rating, vendidos, imagen, categoria,
 *     urlAfiliado, badge, endsAt, caduca }] }
 *
 * ── POR QUÉ TAMBIÉN MIRA EL HISTÓRICO ───────────────────────────────────────
 * Este es el widget más visible del sitio: promocionar ahí un descuento que el
 * histórico ya demostró falso sería la contradicción más visible posible. Por
 * eso se descarta 'descuento-falso' (si el producto tiene histórico).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categorizar } from '../utils/categorias.js';
import { resumirHistorico, veredictoPrecio, NIVEL_DESCUENTO_FALSO } from '../utils/historico.js';
import { ordenParaPublicar } from '../utils/vitrina.js';
import { leerVitrina } from './vitrinaDisco.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORICO_PATH = path.resolve(__dirname, '../data/historico-precios.json');
const OUTPUT_DIR = path.resolve(__dirname, '../../public/data');
const OUTPUT_PATH = path.resolve(OUTPUT_DIR, 'relampago.json');

function escribir(output) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
}

try {
  console.log('\n⚡ [Relámpago] Generando carrusel desde la vitrina...');
  const { productos } = leerVitrina();

  let productosHist = {};
  try {
    productosHist = JSON.parse(fs.readFileSync(HISTORICO_PATH, 'utf-8'))?.productos ?? {};
  } catch { /* archivo ausente o ilegible: se sigue con {} */ }

  const esDescuentoFalso = (o) => {
    const v = veredictoPrecio(o.precio_actual, resumirHistorico(productosHist[o.id]), { descuento: o.descuento });
    return v.nivel === NIVEL_DESCUENTO_FALSO;
  };

  const relampago = ordenParaPublicar(productos.filter((o) => o.oferta_relampago && !esDescuentoFalso(o)));

  // La fecha que se anuncia es la de la revisión más vieja del lote.
  const detectadoEl = relampago.reduce((min, o) => (o.revisado < min ? o.revisado : min), relampago[0]?.revisado ?? null);

  escribir({
    detectadoEl,
    ofertas: relampago.map((o) => ({
      id: o.id,
      titulo: o.titulo,
      precioActual: o.precio_actual,
      precioOriginal: o.precio_previo ?? null,
      descuentoReal: Math.round(o.descuento ?? 0),
      scoreKP: o.score_kalidad_presio ?? 0,
      rating: o.rating ?? 0,
      vendidos: o.vendidos ?? 0,
      imagen: o.imagen ?? '',
      categoria: categorizar(o.titulo ?? ''),
      // Link oficial, tal cual. El navegador lo pinta sin tocarlo.
      urlAfiliado: o.link_afiliado,
      badge: typeof o.destacado === 'string' ? o.destacado : null,
      endsAt: o.fin_oferta,   // hora de fin real, o null (sin cuenta regresiva)
      caduca: o.caduca,       // retiro de seguridad
    })),
  });

  console.log(relampago.length
    ? `✅ [Relámpago] ${relampago.length} oferta(s) relámpago en public/data/relampago.json.\n`
    : '✅ [Relámpago] Ninguna relámpago activa en la vitrina: el carrusel mostrará su estado vacío.\n');
} catch (error) {
  console.error(`\n❌ [Relámpago] Error: ${error.message}`);
  // NO hacer process.exit(1): si esto falla, el build debe continuar con el
  // relampago.json anterior (si existe).
  console.warn('⚠ [Relámpago] El build continuará con el JSON previo (si existe).\n');
}
