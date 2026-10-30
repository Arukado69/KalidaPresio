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
import { registrarPrecio, podar, elegirFuentes } from '../utils/historico.js';
import { clavesObservacion } from '../utils/vitrina.js';
import { fusionarCatalogo } from '../utils/detector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEED = path.resolve(__dirname, '../data/ofertas.json');
const OBSERVACIONES = path.resolve(__dirname, '../data/observaciones.json');
const HISTORICO = path.resolve(__dirname, '../data/historico-precios.json');
const CATALOGO = path.resolve(__dirname, '../data/catalogo-observado.json');

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

// ── Las DOS fuentes ────────────────────────────────────────────────────────
// El feed del sitio (40 destacados, cada 3 h) da FRECUENCIA; la pasada
// profunda (p1-p5, 2 veces al día) da COBERTURA. Sumarlas cuesta cero: las
// observaciones del feed ya están pagadas.
const crudo = leerJson(FEED, null);
const ofertas = Array.isArray(crudo) ? crudo : (crudo?.items ?? []);
const observado = leerJson(OBSERVACIONES, null);
const precios = observado?.precios ?? {};

// La fecha de la OBSERVACIÓN es la del dato, no la del reloj de quien ejecuta:
// la del sello más reciente. Y una fuente con un sello de otro momento no
// entra con esa fecha (ver elegirFuentes: ofertas.json se quedó en el 8 de
// octubre y habría registrado esos precios como vistos hoy, a diario).
// Cada oferta se registra por artículo Y por catálogo (/p/MLM…), que es la
// clave con la que la vitrina la busca; observaciones.json ya trae las dos.
const { fecha, momento, usadas, omitidas, lecturas: crudas } = elegirFuentes([
  {
    nombre: 'observaciones.json',
    sello: observado?.generadoEl,
    lecturas: Object.entries(precios).map(([id, p]) => [id, Number(p)]),
  },
  {
    nombre: 'ofertas.json',
    sello: crudo?.generadoEl,
    lecturas: ofertas.flatMap((o) => clavesObservacion(o.id, o.url_producto ?? o.link_afiliado)
      .map((clave) => [clave, Number(o.precio_actual)])),
  },
]);
for (const nombre of omitidas) {
  console.warn(`⏭  [histórico] ${nombre} es de otro momento: no se registra con fecha ${fecha}.`);
}

/** @type {Array<[string, number]>} */
const lecturas = crudas.filter(([id, p]) => id && Number.isFinite(p) && p > 0);

if (lecturas.length === 0) {
  console.error(`❌ [histórico] Sin precios de ${fecha} en ${usadas.join(' ni en ') || 'ninguna fuente'}. No se registra nada.`);
  process.exit(1);
}

const previo = leerJson(HISTORICO, { productos: {} });
const productos = { ...(previo.productos ?? {}) };

let nuevos = 0;
for (const [id, precio] of lecturas) {
  if (!productos[id]) nuevos++;
  productos[id] = registrarPrecio(productos[id], fecha, precio);
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

console.log(`📈 [histórico] ${fecha}: ${lecturas.length} lecturas sobre ${Object.keys(productos).length} productos.`);
console.log(`   ${total} productos seguidos (${nuevos} nuevos, ${olvidados} olvidados) · ${conHistoria} ya con 3+ días.`);
console.log(cambio ? `   Archivo actualizado (${kb} KB).` : '   Sin cambios de precio hoy; no se reescribe.');

// ── Las fichas, para el Detector del Buen Fin ──────────────────────────────
// Solo si observaciones.json entró en esta corrida: una ficha vieja con la
// fecha de hoy le pondría veredicto a un precio que ya nadie vio. Se versiona
// como el histórico (es observación, no derivado), pero solo guarda lo visto
// en los últimos días: es lo único que la página necesita.
if (usadas.includes('observaciones.json') && observado?.fichas) {
  const catalogoPrevio = leerJson(CATALOGO, { productos: {} });
  const catalogo = fusionarCatalogo(catalogoPrevio.productos, observado.fichas, fecha);
  if (JSON.stringify(catalogo) !== JSON.stringify(catalogoPrevio.productos ?? {})) {
    writeFileSync(CATALOGO, JSON.stringify({ actualizadoEl: momento.toISOString(), productos: catalogo }, null, 0) + '\n', 'utf-8');
  }
  console.log(`🗂  [catálogo] ${Object.keys(catalogo).length} fichas de los últimos días (para /buen-fin).`);
}
