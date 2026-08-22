/**
 * registrarHistorico.js — Guarda la foto de precios de cada corrida del bot.
 *
 * ── POR QUÉ ES URGENTE ─────────────────────────────────────────────────────
 * Es la única mejora del proyecto que se vuelve más cara cuanto más se espera:
 * cada día sin registrar es un día de historial que ya no se recupera. El
 * valor no aparece hoy, aparece en un mes — pero solo si se empieza hoy.
 *
 * ── POR QUÉ SÍ SE VERSIONA ─────────────────────────────────────────────────
 * El repo tiene una regla: los datos DERIVADOS no se versionan (ofertas.json
 * seccionado, _redirects, relampago.json…) porque cada build los regenera y
 * versionarlos fue lo que dejó la portada dos meses con precios de junio.
 *
 * Este archivo es lo contrario: es OBSERVACIÓN ACUMULADA. No se puede
 * regenerar — si se pierde, se pierde para siempre. Por eso se versiona, y por
 * eso se poda (90 días de historia, y fuera los productos que llevan 30 días
 * sin aparecer): sin poda crecería sin techo y acabaría pesando como el web.zip
 * que quitamos.
 *
 * Se acumula por DÍA (min/max), no por corrida: ocho pasadas con el mismo
 * precio no generan ocho commits ni ocho redespliegues.
 *
 * Ejecutar:  npm run registrar-historico
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registrarPrecio, podar } from '../utils/historico.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEED = path.resolve(__dirname, '../data/ofertas.json');
const HISTORICO = path.resolve(__dirname, '../data/historico-precios.json');

const DIAS_HISTORIA = 90;
const DIAS_OLVIDO = 30;

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
  console.error('❌ [histórico] ofertas.json vacío o ilegible. No se registra nada.');
  process.exit(1);
}

// La fecha de la OBSERVACIÓN es la del feed, no la del reloj de quien ejecuta:
// si se re-procesa un feed viejo, la foto tiene que quedar en su día real.
const sello = Date.parse(crudo?.generadoEl ?? '');
const momento = Number.isNaN(sello) ? new Date() : new Date(sello);
const fecha = momento.toISOString().slice(0, 10);

const previo = leerJson(HISTORICO, { productos: {} });
const productos = { ...(previo.productos ?? {}) };

let nuevos = 0;
for (const o of ofertas) {
  if (!o?.id || !Number.isFinite(o.precio_actual) || o.precio_actual <= 0) continue;
  if (!productos[o.id]) nuevos++;
  productos[o.id] = registrarPrecio(productos[o.id], fecha, o.precio_actual);
}

const podados = podar(productos, { dias: DIAS_HISTORIA, diasOlvido: DIAS_OLVIDO, hoy: momento });
const olvidados = Object.keys(productos).length - Object.keys(podados).length;

const salida = {
  actualizadoEl: momento.toISOString(),
  diasHistoria: DIAS_HISTORIA,
  productos: podados,
};

// Se compara SIN la marca de tiempo: si nada cambió de precio hoy, el archivo
// queda igual y el workflow no commitea. Así ocho corridas diarias no generan
// ocho despliegues.
const anterior = JSON.stringify(previo.productos ?? {});
const ahora = JSON.stringify(podados);
const cambio = anterior !== ahora;

if (cambio) {
  writeFileSync(HISTORICO, JSON.stringify(salida, null, 0) + '\n', 'utf-8');
}

const total = Object.keys(podados).length;
const conHistoria = Object.values(podados).filter((e) => e.length >= 3).length;
const kb = (Buffer.byteLength(ahora) / 1024).toFixed(1);

console.log(`📈 [histórico] ${fecha}: ${ofertas.length} precios observados.`);
console.log(`   ${total} productos seguidos (${nuevos} nuevos, ${olvidados} olvidados) · ${conHistoria} ya con 3+ días.`);
console.log(cambio ? `   Archivo actualizado (${kb} KB).` : '   Sin cambios de precio hoy; no se reescribe.');
