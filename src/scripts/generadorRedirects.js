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
  const ofertas = JSON.parse(rawData);

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

  // Generación del archivo _redirects
  let redirectsContent = '# Redirecciones Perimetrales Automáticas - KalidaPresio\n';
  redirectsContent += '# Generado en Build-Time desde ofertas.json. No editar manualmente.\n\n';

  let sinRastreo = 0;
  ofertas.forEach((oferta) => {
    if (oferta.id && oferta.link_afiliado) {
      const { url, faltanParams } = asegurarParametrosAfiliado(oferta.link_afiliado);
      if (faltanParams) {
        sinRastreo++;
        console.warn(`   ⚠ "${oferta.id}" no pudo asegurar matt_tool/matt_word.`);
      }
      redirectsContent += `/recomienda/${oferta.id}  ${url}  302\n`;
    }
  });

  // Escritura segura con sobrescritura automática
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, redirectsContent, 'utf-8');

  console.log(`✅ [KalidaPresio] Archivo _redirects inyectado en /public exitosamente.`);
  console.log(`✅ ${ofertas.length - sinRastreo}/${ofertas.length} rutas con registro de afiliado garantizado (Cloaking Nativo).\n`);

} catch (error) {
  console.error(`\n❌ [KalidaPresio] Error crítico: ${error.message}`);
  process.exit(1);
}
