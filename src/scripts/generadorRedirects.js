import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Configuración nativa de rutas para Node.js (ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rutas absolutas para lectura y escritura
// FEED DE OFERTAS: la fuente de verdad ahora es ofertas.json (salida del scraper n8n).
const dataPath = path.resolve(__dirname, '../data/ofertas.json');
const envPath = path.resolve(__dirname, '../../.env');
const outputDir = path.resolve(__dirname, '../../public');
const outputPath = path.resolve(outputDir, '_redirects');
// Snippet que IMPORTA el Caddyfile. Es la salida que de verdad se aplica en
// producción: `_redirects` es un formato de Cloudflare Pages / Netlify y Caddy
// no lo lee — con el despliegue en Hetzner esas rutas quedaban muertas y, por
// el `try_files … /index.html`, devolvían la portada con HTTP 200.
const caddyDir = path.resolve(__dirname, '../../docker');
const caddyPath = path.resolve(caddyDir, 'redirects.caddy');
// MAPA DE ENLACES para el backend: id → URL de producto SIN query.
// `/recomienda/*` lo resuelve Caddy con lo que haya en el build de hoy, así que
// un id que salió del feed devuelve 404. Eso está bien para un enlace de dentro
// del sitio, pero NO para uno publicado en Telegram hace tres semanas: ese
// tiene que seguir llevando a la oferta. Por eso el backend guarda su propia
// tabla acumulada y la alimenta desde este archivo — el build ya no es quien
// decide qué enlaces existen, solo cuáles son nuevos.
const enlacesDir = path.resolve(outputDir, 'data');
const enlacesPath = path.resolve(enlacesDir, 'enlaces.json');

// ── Carga de credenciales de afiliado ───────────────────────────────────────────
// En local: desde .env. En Cloudflare Pages: desde las Environment Variables del
// dashboard (allí no existe el archivo .env, pero process.env sí está poblado).
try {
  process.loadEnvFile(envPath);
} catch {
  // Sin archivo .env (ej. build en Cloudflare). Se usa process.env directamente.
}

const MATT_TOOL = process.env.ML_MATT_TOOL ?? '';
const MATT_WORD = process.env.ML_MATT_WORD ?? '';

// Campos obligatorios en la raíz de cada oferta del feed
const REQUIRED_ROOT_FIELDS = ['id', 'titulo', 'precio_actual', 'link_afiliado'];

/**
 * Valida la integridad estructural de una oferta individual.
 * Lanza un error descriptivo si alguna regla se incumple.
 */
function validarOferta(oferta, index) {
  const oid = oferta.id || `[index ${index}]`;

  // 1. Verificar campos obligatorios en la raíz
  for (const field of REQUIRED_ROOT_FIELDS) {
    if (oferta[field] === undefined || oferta[field] === null || oferta[field] === '') {
      throw new Error(`Oferta "${oid}" carece del campo obligatorio "${field}".`);
    }
  }

  // 2. precio_actual debe ser un número válido
  if (typeof oferta.precio_actual !== 'number' || Number.isNaN(oferta.precio_actual)) {
    throw new Error(`Oferta "${oid}": precio_actual debe ser un número válido.`);
  }

  // 3. link_afiliado debe ser una URL http(s)
  if (!/^https?:\/\//i.test(oferta.link_afiliado)) {
    throw new Error(`Oferta "${oid}": link_afiliado debe ser una URL http(s) válida.`);
  }
}

/**
 * GARANTÍA DE RASTREO DE COMISIONES.
 * Asegura que cada enlace de afiliado lleve matt_tool y matt_word (tu registro).
 * - Si el feed (n8n) ya los incluye, se respetan (no se sobrescriben).
 * - Si faltan, se inyectan desde el entorno (ML_MATT_TOOL / ML_MATT_WORD).
 * Devuelve { url, faltanParams } para poder advertir si no hubo forma de rastrear.
 */
function asegurarParametrosAfiliado(rawUrl) {
  let faltanParams = false;
  try {
    const u = new URL(rawUrl);
    if (!u.searchParams.has('matt_tool')) {
      if (MATT_TOOL) u.searchParams.set('matt_tool', MATT_TOOL);
      else faltanParams = true;
    }
    if (!u.searchParams.has('matt_word')) {
      if (MATT_WORD) u.searchParams.set('matt_word', MATT_WORD);
      else faltanParams = true;
    }
    return { url: u.toString(), faltanParams };
  } catch {
    // validarOferta ya garantiza que es http(s); este catch es defensivo.
    return { url: rawUrl, faltanParams: true };
  }
}

// Proceso principal
try {
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const crudo = JSON.parse(rawData);
  // El feed puede venir como array (formato antiguo) o como sobre con
  // sello de fecha `{ generadoEl, items }`. Las dos valen.
  const ofertas = Array.isArray(crudo) ? crudo : (crudo?.items ?? []);
  if (!Array.isArray(ofertas) || ofertas.length === 0) {
    throw new Error('ofertas.json no contiene ofertas utilizables.');
  }

  // Validación en build-time: abortar si alguna oferta es malformada
  console.log('\n🔍 [KalidaPresio] Validando integridad del feed de ofertas...');
  ofertas.forEach((oferta, index) => validarOferta(oferta, index));
  console.log(`✅ [KalidaPresio] ${ofertas.length} ofertas validadas correctamente.`);

  if (!MATT_TOOL || !MATT_WORD) {
    console.warn(
      '⚠ [KalidaPresio] ML_MATT_TOOL / ML_MATT_WORD no están en el entorno. ' +
      'Solo se rastrearán las comisiones de enlaces que ya traigan sus parámetros.'
    );
  } else {
    console.log(`🔗 [KalidaPresio] Registro de afiliado activo (matt_tool=${MATT_TOOL}).`);
  }
  console.log('');

  // ── Generación de las DOS salidas ─────────────────────────────────────────
  const cabecera = (comentario) =>
    `${comentario} Redirecciones de afiliado — KalidaPresio\n` +
    `${comentario} GENERADO en build-time desde ofertas.json. No editar a mano.\n` +
    `${comentario} Fecha: ${new Date().toISOString()}\n\n`;

  // 1) Formato Caddy — el que SÍ se aplica en producción (Hetzner + Docker).
  let caddyContent = cabecera('#');
  // 2) Formato _redirects — compatibilidad con Cloudflare Pages / Netlify.
  //    Se conserva por si algún día se vuelve a desplegar ahí; Caddy lo ignora.
  let netlifyContent = cabecera('#');

  let sinRastreo = 0;
  let rutas = 0;
  const enlaces = {};
  ofertas.forEach((oferta) => {
    if (oferta.id && oferta.link_afiliado) {
      const { url, faltanParams } = asegurarParametrosAfiliado(oferta.link_afiliado);
      if (faltanParams) {
        sinRastreo++;
        console.warn(`   ⚠ "${oferta.id}" no pudo asegurar matt_tool/matt_word.`);
      }
      // 302 (temporal) a propósito: el destino cambia con cada refresco del feed.
      caddyContent += `redir /recomienda/${oferta.id} ${url} 302\n`;
      netlifyContent += `/recomienda/${oferta.id}  ${url}  302\n`;
      // Sin query: el backend le pega SUS matt_* con el canal de cada enlace
      // corto. Guardar la URL ya etiquetada haría que todos los canales
      // heredaran la etiqueta del build y volveríamos a no poder distinguirlos.
      enlaces[oferta.id] = oferta.link_afiliado.split('?')[0].split('#')[0];
      rutas++;
    }
  });

  // Escritura segura con sobrescritura automática
  for (const dir of [outputDir, caddyDir, enlacesDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, netlifyContent, 'utf-8');
  fs.writeFileSync(caddyPath, caddyContent, 'utf-8');
  fs.writeFileSync(
    enlacesPath,
    JSON.stringify({ generadoEl: new Date().toISOString(), items: enlaces }, null, 0),
    'utf-8',
  );

  console.log(`✅ [KalidaPresio] ${rutas} redirects escritos en docker/redirects.caddy (los que aplica el servidor).`);
  console.log(`✅ [KalidaPresio] Copia en public/_redirects (compatibilidad Cloudflare/Netlify).`);
  console.log(`✅ [KalidaPresio] ${rutas} enlaces en public/data/enlaces.json (los sincroniza el backend para /r/).`);
  console.log(`✅ ${ofertas.length - sinRastreo}/${ofertas.length} rutas con registro de afiliado garantizado (Cloaking Nativo).\n`);

} catch (error) {
  console.error(`\n❌ [KalidaPresio] Error crítico: ${error.message}`);
  process.exit(1);
}
