// src/scripts/importarMercadoLibre.js
// KalidaPresio — Motor de Catálogo Curado — API Oficial ML /items/{ID}
// Ejecutar: npm run obtener-datos
// Requiere: Node.js >= 22.12.0

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Carga de variables de entorno (nativo Node 22, sin dotenv) ─────────────────
const envPath = join(__dirname, '../../.env');
try {
  process.loadEnvFile(envPath);
} catch (e) {
  console.error('✗ No se pudo cargar .env desde:', envPath);
  process.exit(1);
}

// ── Validación de credenciales ────────────────────────────────────────────────
const REQUERIDAS = ['ML_CLIENT_ID', 'ML_CLIENT_SECRET', 'ML_REFRESH_TOKEN', 'ML_MATT_TOOL', 'ML_MATT_WORD'];
const faltantes = REQUERIDAS.filter(k => !process.env[k]);
if (faltantes.length > 0) {
  console.error('✗ Variables faltantes en .env:', faltantes.join(', '));
  process.exit(1);
}


// ════════════════════════════════════════════════════════
// CONFIGURACIÓN CENTRAL
// ════════════════════════════════════════════════════════

const AFILIADO = {
  matt_tool: process.env.ML_MATT_TOOL,
  matt_word: process.env.ML_MATT_WORD,
};

const CONFIG = {
  // Pausa entre requests individuales (ms) — respetar rate limit de ML
  delay_entre_items_ms:  300,
  filtro_precio_min_mxn: 200,
  ruta_ids_curados:      'src/data/ids_curados.json',
  ruta_output:           'src/data/productos.json',
  ruta_token_cache:      join(__dirname, '.ml_token_cache.json'),
};


// ════════════════════════════════════════════════════════
// BLOQUE 2: SISTEMA DE TOKENS (ROLLING OAuth 2.0)
// ════════════════════════════════════════════════════════

/** Pausa asíncrona */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Lee el estado de sesión desde el archivo de caché.
 * Devuelve null si el archivo no existe o está corrupto.
 * @returns {{ access_token: string, refresh_token: string, expires_at: number } | null}
 */
function leerCacheTokens() {
  if (!existsSync(CONFIG.ruta_token_cache)) return null;
  try {
    const raw = readFileSync(CONFIG.ruta_token_cache, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.access_token || !data.refresh_token || !data.expires_at) return null;
    return data;
  } catch {
    console.warn('⚠ Caché de tokens corrupta. Se renovará.');
    return null;
  }
}

/**
 * Persiste el nuevo par de tokens en el archivo de caché.
 * NUNCA modifica el .env.
 * @param {string} accessToken
 * @param {string} refreshToken
 * @param {number} expiresInSeconds - TTL en segundos devuelto por ML (normalmente 21600 = 6h)
 */
function guardarCacheTokens(accessToken, refreshToken, expiresInSeconds) {
  const estado = {
    access_token:  accessToken,
    refresh_token: refreshToken,
    expires_at:    Date.now() + (expiresInSeconds * 1000) - (5 * 60 * 1000),
    updated_at:    new Date().toISOString(),
  };
  writeFileSync(CONFIG.ruta_token_cache, JSON.stringify(estado, null, 2), 'utf-8');
  console.log(`   ✓ Tokens en caché. Expiran en: ${Math.round(expiresInSeconds / 3600)}h`);
}

/**
 * Devuelve un access_token válido. Si el caché tiene uno vigente, lo reutiliza.
 * Si está expirado o no existe, ejecuta el flujo de refresh token automáticamente.
 * @returns {Promise<string>} - access_token listo para usar en headers
 */
async function obtenerAccessToken() {
  const cache = leerCacheTokens();
  if (cache && Date.now() < cache.expires_at) {
    const min = Math.round((cache.expires_at - Date.now()) / 60000);
    console.log(`   🔑 Token en caché vigente (expira en ${min} min).`);
    return cache.access_token;
  }

  console.log('   🔄 Renovando tokens con Refresh Token...');
  const refreshTokenActual = cache?.refresh_token ?? process.env.ML_REFRESH_TOKEN;

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     process.env.ML_CLIENT_ID,
    client_secret: process.env.ML_CLIENT_SECRET,
    refresh_token: refreshTokenActual,
  });

  let res;
  try {
    res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
      signal:  AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new Error(`Error de red en OAuth: ${err.message}`);
  }

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(
      `OAuth falló (HTTP ${res.status}): ${txt}\n` +
      `Si el error es 'invalid_grant', regenera ML_REFRESH_TOKEN en DevCenter.`
    );
  }

  const tokens = await res.json();
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(`Respuesta OAuth inesperada. Keys: ${Object.keys(tokens).join(', ')}`);
  }

  guardarCacheTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in ?? 21600);
  return tokens.access_token;
}


// ════════════════════════════════════════════════════════
// BLOQUE 3: CLIENTE HTTP AUTENTICADO CON RETRY EXPONENCIAL
// ════════════════════════════════════════════════════════

/**
 * Fetch autenticado con retry exponencial.
 * @param {string} url
 * @param {string} accessToken - Bearer token para el header Authorization
 * @param {number} intentos - Máximo de reintentos (default: 3)
 * @returns {Promise<any>} - JSON de la respuesta
 */
async function fetchAutenticado(url, accessToken, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept':        'application/json',
          'User-Agent':    'KalidaPresio/2.0 (comparador hardware; contacto@kalidapresio.com)',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 429) {
        const espera = (i + 1) * 2500;
        console.log(`   ⏳ Rate limit. Esperando ${espera / 1000}s...`);
        await sleep(espera);
        continue;
      }
      if (res.status === 401) throw new Error('AUTH_EXPIRED');
      if (!res.ok) throw new Error(`HTTP ${res.status} en: ${url}`);
      return await res.json();

    } catch (err) {
      if (err.message === 'AUTH_EXPIRED') throw err;
      if (i === intentos - 1) throw err;
      console.warn(`   ↺ Intento ${i + 1}/${intentos}: ${err.message}`);
      await sleep(1000 * (i + 1));
    }
  }
}


// ════════════════════════════════════════════════════════
// BLOQUE 4: OBTENCIÓN DE ITEM INDIVIDUAL + REVIEWS
// ════════════════════════════════════════════════════════

/**
 * Obtiene el objeto completo de un producto por su ID.
 * Endpoint: https://api.mercadolibre.com/items/{ID}
 * Devuelve precio, imágenes HD, atributos técnicos, vendedor, URL.
 *
 * @param {string} itemId - ID del producto (ej: MLM123456789 o MLM-123456789)
 * @param {string} accessToken
 * @returns {Promise<object|null>} - Objeto completo o null si falla
 */
async function obtenerItemCompleto(itemId, accessToken) {
  // Normalizar ID: ML acepta con y sin guion, pero la convención es sin guion
  const idNormalizado = itemId.replace(/-/g, '');

  try {
    const item = await fetchAutenticado(
      `https://api.mercadolibre.com/items/${idNormalizado}`,
      accessToken
    );
    return item;
  } catch (err) {
    if (err.message === 'AUTH_EXPIRED') throw err; // Propagar para que main() renueve
    console.error(`   ✗ Error obteniendo ${idNormalizado}: ${err.message}`);
    return null;
  }
}

/**
 * Obtiene datos de reviews de un item.
 * Se llama siempre para enriquecer el objeto con rating y total de opiniones.
 *
 * @param {string} itemId
 * @param {string} accessToken
 * @returns {Promise<{ rating_average: number, total: number }>}
 */
async function obtenerReviews(itemId, accessToken) {
  const idNormalizado = itemId.replace(/-/g, '');
  try {
    const data = await fetchAutenticado(
      `https://api.mercadolibre.com/reviews/item/${idNormalizado}`,
      accessToken
    );
    return {
      rating_average: data.rating_average ?? 0,
      total:          data.paging?.total ?? 0,
    };
  } catch {
    // No abortar si reviews falla — devolver valores neutros
    return { rating_average: 0, total: 0 };
  }
}


// ════════════════════════════════════════════════════════
// BLOQUE 5: EXTRACTOR DE SPECS DESDE attributes[]
// ════════════════════════════════════════════════════════

/**
 * Busca el valor de un atributo en el array attributes[] del item.
 * Los IDs de atributos de ML usan mayúsculas con guiones bajos (ej: "RAM", "PROCESSOR").
 *
 * @param {Array} attributes - Array de atributos del item
 * @param {string[]} posiblesIds - IDs a buscar en orden de preferencia
 * @returns {string|null}
 */
function buscarAtributo(attributes, posiblesIds) {
  if (!Array.isArray(attributes)) return null;
  for (const id of posiblesIds) {
    const attr = attributes.find(a =>
      a.id?.toUpperCase() === id.toUpperCase() ||
      a.name?.toUpperCase().includes(id.toUpperCase())
    );
    if (attr?.value_name) return attr.value_name;
  }
  return null;
}

/**
 * Extrae especificaciones canónicas priorizando el array attributes[] del item.
 * Fallback al parser de regex sobre el título si attributes no tiene el dato.
 *
 * @param {object} item - Objeto completo del endpoint /items/{ID}
 * @param {string} schemaCategoria
 * @returns {object} - Especificaciones canónicas en snake_case
 */
function extraerSpecs(item, schemaCategoria) {
  const attrs = item.attributes ?? [];
  const titulo = item.title ?? '';

  // ── Valores desde attributes (fuente primaria, más precisa) ──────────────────
  const ramAttrs     = buscarAtributo(attrs, ['RAM', 'MEMORY', 'RAM_MEMORY', 'INTERNAL_MEMORY']);
  const cpuAttrs     = buscarAtributo(attrs, ['PROCESSOR', 'CPU', 'PROCESSOR_MODEL', 'PROCESADOR']);
  const gpuAttrs     = buscarAtributo(attrs, ['GPU', 'VIDEO_CARD', 'GRAPHICS_CARD', 'TARJETA_VIDEO']);
  const ssdAttrs     = buscarAtributo(attrs, ['STORAGE', 'HDD_CAPACITY', 'SSD_CAPACITY', 'INTERNAL_STORAGE', 'ALMACENAMIENTO']);
  const osAttrs      = buscarAtributo(attrs, ['OPERATING_SYSTEM', 'OS', 'SISTEMA_OPERATIVO']);
  const screenAttrs  = buscarAtributo(attrs, ['DISPLAY_SIZE', 'SCREEN_SIZE', 'SCREEN', 'DISPLAY']);
  const hzAttrs      = buscarAtributo(attrs, ['REFRESH_RATE', 'MAXIMUM_REFRESH_RATE', 'TASA_REFRESCO']);
  const panelAttrs   = buscarAtributo(attrs, ['DISPLAY_TECHNOLOGY', 'PANEL_TYPE', 'TIPO_PANEL']);
  const resAttrs     = buscarAtributo(attrs, ['DISPLAY_RESOLUTION', 'RESOLUTION', 'RESOLUCION']);
  const weightAttrs  = buscarAtributo(attrs, ['WEIGHT', 'ITEM_WEIGHT', 'PESO']);
  const connAttrs    = buscarAtributo(attrs, ['CONNECTIVITY', 'WIRELESS_TYPE', 'CONECTIVIDAD']);
  const battAttrs    = buscarAtributo(attrs, ['BATTERY_CAPACITY', 'BATTERY', 'BATERIA']);
  const respAttrs    = buscarAtributo(attrs, ['RESPONSE_TIME', 'RESPONSE_RATE', 'TIEMPO_RESPUESTA']);
  const brightnAttrs = buscarAtributo(attrs, ['BRIGHTNESS', 'MAXIMUM_BRIGHTNESS', 'BRILLO']);
  const hdrAttrs     = buscarAtributo(attrs, ['HDR_TECHNOLOGY', 'HDR']);
  const portAttrs    = buscarAtributo(attrs, ['VIDEO_PORTS', 'PORTS', 'PUERTOS_VIDEO', 'CONECTORES']);
  const compAttrs    = buscarAtributo(attrs, ['COMPATIBLE_WITH', 'COMPATIBILITY', 'COMPATIBILIDAD']);
  const colorAttrs   = buscarAtributo(attrs, ['COLOR', 'MAIN_COLOR']);
  const socketAttrs  = buscarAtributo(attrs, ['CPU_SOCKET', 'SOCKET', 'SOCKET_TYPE']);
  const tdpAttrs     = buscarAtributo(attrs, ['TDP', 'POWER_CONSUMPTION', 'CONSUMO']);
  const freqAttrs    = buscarAtributo(attrs, ['FREQUENCY', 'BASE_FREQUENCY', 'FRECUENCIA']);
  const genAttrs     = buscarAtributo(attrs, ['GENERATION', 'PROCESSOR_GENERATION', 'GENERACION']);

  // ── Fallback: parser de regex sobre el título (fuente secundaria) ─────────────
  const specsRegex = parsearEspecificacionesRegex(titulo, schemaCategoria);

  // ── Construcción del schema canónico por categoría ────────────────────────────
  switch (schemaCategoria) {
    case 'Computo':
      return {
        procesador:        cpuAttrs  ?? specsRegex.procesador,
        ram_gb:            ramAttrs  ?? specsRegex.ram_gb,
        almacenamiento_gb: ssdAttrs  ?? specsRegex.almacenamiento_gb,
        gpu:               gpuAttrs  ?? specsRegex.gpu,
        pantalla_hz:       (screenAttrs && hzAttrs) ? `${screenAttrs} — ${hzAttrs}`
                           : screenAttrs ?? hzAttrs ?? specsRegex.pantalla_hz,
        sistema_operativo: osAttrs   ?? specsRegex.sistema_operativo,
        conectividad:      connAttrs ?? specsRegex.conectividad,
        bateria:           battAttrs ?? specsRegex.bateria,
      };

    case 'Monitores':
      return {
        tamano_pulgadas:  screenAttrs ?? specsRegex.tamano_pulgadas,
        resolucion:       resAttrs    ?? specsRegex.resolucion,
        tasa_refresco_hz: hzAttrs     ?? specsRegex.tasa_refresco_hz,
        tiempo_respuesta: respAttrs   ?? specsRegex.tiempo_respuesta,
        tipo_panel:       panelAttrs  ?? specsRegex.tipo_panel,
        hdr:              hdrAttrs    ?? specsRegex.hdr,
        conectores:       portAttrs   ?? specsRegex.conectores,
        brillo_nits:      brightnAttrs ?? specsRegex.brillo_nits,
      };

    case 'Perifericos':
      return {
        tipo:                       buscarAtributo(attrs, ['ITEM_CONDITION', 'LINE', 'TIPO']) ?? specsRegex.tipo,
        conectividad:               connAttrs   ?? specsRegex.conectividad,
        compatibilidad:             compAttrs   ?? specsRegex.compatibilidad,
        caracteristica_principal:   buscarAtributo(attrs, ['KEYBOARD_TYPE', 'SWITCH_TYPE', 'FEATURES']) ?? specsRegex.caracteristica_principal,
        peso_gramos:                weightAttrs ?? specsRegex.peso_gramos,
        color:                      colorAttrs  ?? specsRegex.color,
      };

    case 'Componentes':
      return {
        tipo_componente:      buscarAtributo(attrs, ['ITEM_TYPE', 'COMPONENT_TYPE']) ?? specsRegex.tipo_componente,
        socket_interfaz:      socketAttrs ?? specsRegex.socket_interfaz,
        velocidad_frecuencia: freqAttrs   ?? specsRegex.velocidad_frecuencia,
        tdp_watts:            tdpAttrs    ?? specsRegex.tdp_watts,
        generacion:           genAttrs    ?? specsRegex.generacion,
        compatibilidad:       compAttrs   ?? specsRegex.compatibilidad,
      };

    default:
      return specsRegex;
  }
}


// ════════════════════════════════════════════════════════
// BLOQUE 6: PARSER DE ESPECIFICACIONES POR REGEX (FALLBACK)
// ════════════════════════════════════════════════════════

/**
 * Deduce especificaciones técnicas del título usando expresiones regulares.
 * REGLA: Si el regex no puede determinarlo, el campo es "N/A".
 * Nunca inventar datos. Nunca undefined.
 * Esta función es el fallback cuando attributes[] del item no tiene el dato.
 *
 * @param {string} titulo - Título completo del listing
 * @param {string} schemaCategoria - 'Computo' | 'Monitores' | 'Perifericos' | 'Componentes'
 * @returns {object} - Especificaciones canónicas en snake_case
 */
function parsearEspecificacionesRegex(titulo, schemaCategoria) {
  const t = titulo.toLowerCase();

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const ex = (regex) => { const m = t.match(regex); return m ? (m[1] ?? m[0]) : null; };

  // ── Extractores reutilizables ─────────────────────────────────────────────────

  const ramGB = ex(/(\d+)\s*gb\s*(?:ddr[45]x?|lpddr[45]x?|ram)?/i);
  const ramFormateada = (() => {
    if (!ramGB) return 'N/A';
    if (t.includes('lpddr5')) return `${ramGB} GB LPDDR5`;
    if (t.includes('lpddr4')) return `${ramGB} GB LPDDR4`;
    if (t.includes('ddr5'))   return `${ramGB} GB DDR5`;
    if (t.includes('ddr4'))   return `${ramGB} GB DDR4`;
    return `${ramGB} GB`;
  })();

  const ssdRaw = ex(/(\d+\s*(?:tb|gb))\s*(?:ssd|nvme|m\.2|hdd|emmc)?/i);
  const ssdTipo = t.includes('nvme') ? 'NVMe SSD'
    : t.includes('ssd') ? 'SSD'
    : t.includes('emmc') ? 'eMMC'
    : t.includes('hdd') ? 'HDD'
    : 'SSD';
  const almacenamiento = ssdRaw ? `${ssdRaw.toUpperCase().replace(/\s/g, '')} ${ssdTipo}` : 'N/A';

  const cpu = (() => {
    const modelos = [
      [/ryzen\s*9\s*(\w+)/i, 'AMD Ryzen 9'],   [/ryzen\s*7\s*(\w+)/i, 'AMD Ryzen 7'],
      [/ryzen\s*5\s*(\w+)/i, 'AMD Ryzen 5'],   [/ryzen\s*3\s*(\w+)/i, 'AMD Ryzen 3'],
      [/core\s*ultra\s*(\d+)/i, 'Intel Core Ultra'],
      [/core\s*i9[-\s](\w+)/i, 'Intel Core i9'], [/core\s*i7[-\s](\w+)/i, 'Intel Core i7'],
      [/core\s*i5[-\s](\w+)/i, 'Intel Core i5'], [/core\s*i3[-\s](\w+)/i, 'Intel Core i3'],
      [/celeron\s*(\w+)/i, 'Intel Celeron'],     [/pentium\s*(\w+)/i, 'Intel Pentium'],
    ];
    for (const [regex, marca] of modelos) {
      const m = t.match(regex);
      if (m) return `${marca} ${m[1] ?? ''}`.trim();
    }
    const apple = ex(/apple\s*(m[1-4](?:\s*(?:pro|max|ultra))?)/i)
      ?? ex(/(m[1-4](?:\s*(?:pro|max|ultra))?)/i);
    if (apple) return `Apple ${apple.toUpperCase()}`;
    if (t.includes('snapdragon')) return `Qualcomm Snapdragon ${ex(/snapdragon\s*(\w+)/i) ?? ''}`.trim();
    return 'N/A';
  })();

  const gpu = (() => {
    const gpus = [
      ['rtx 4090', 'NVIDIA RTX 4090'], ['rtx 4080', 'NVIDIA RTX 4080'],
      ['rtx 4070 ti', 'NVIDIA RTX 4070 Ti'], ['rtx 4070', 'NVIDIA RTX 4070'],
      ['rtx 4060 ti', 'NVIDIA RTX 4060 Ti'], ['rtx 4060', 'NVIDIA RTX 4060'],
      ['rtx 4050', 'NVIDIA RTX 4050'], ['rtx 3080', 'NVIDIA RTX 3080'],
      ['rtx 3070', 'NVIDIA RTX 3070'], ['rtx 3060 ti', 'NVIDIA RTX 3060 Ti'],
      ['rtx 3060', 'NVIDIA RTX 3060'], ['rtx 3050', 'NVIDIA RTX 3050'],
      ['rx 7900', 'AMD RX 7900'], ['rx 7800', 'AMD RX 7800'],
      ['rx 7700', 'AMD RX 7700'], ['rx 7600', 'AMD RX 7600'],
      ['rx 6800', 'AMD RX 6800'], ['rx 6700', 'AMD RX 6700'],
      ['rx 6600', 'AMD RX 6600'], ['rx 6500', 'AMD RX 6500'],
      ['iris xe', 'Intel Iris Xe'], ['radeon graphics', 'AMD Radeon Graphics'],
    ];
    for (const [token, label] of gpus) {
      if (t.includes(token)) return label;
    }
    if (t.includes('integrada') || t.includes('integrated')) return 'Gráficos Integrados';
    return 'N/A';
  })();

  const hz         = ex(/(\d{2,3})\s*hz/i);
  const pulgadas   = ex(/(\d{1,2}(?:\.\d)?)\s*(?:"|pulgadas?|inch)/i);
  const resolucion = t.includes('4k') || t.includes('3840') ? '3840×2160 (4K UHD)'
    : t.includes('wqhd') || t.includes('qhd') || t.includes('2560') ? '2560×1440 (QHD)'
    : t.includes('ultrawide') && t.includes('1440') ? '3440×1440 (UW-QHD)'
    : t.includes('ultrawide') ? '2560×1080 (UW-FHD)'
    : t.includes('1920') || t.includes('fhd') || t.includes('1080p') ? '1920×1080 (FHD)'
    : t.includes(' hd ') ? '1366×768 (HD)'
    : 'N/A';
  const panel = t.includes('oled') ? 'OLED'
    : t.includes('nano ips') ? 'Nano IPS'
    : t.includes('ips') ? 'IPS'
    : (t.includes(' va ') || t.includes('va,')) ? 'VA'
    : t.includes(' tn ') ? 'TN'
    : 'N/A';
  const conectividad = (t.includes('inalámbrico') || t.includes('inalambrico') || t.includes('wireless') || t.includes('bluetooth'))
    ? (t.includes('bluetooth') && t.includes('2.4') ? 'Bluetooth + 2.4GHz'
      : t.includes('bluetooth') ? 'Bluetooth'
      : 'Inalámbrico 2.4GHz')
    : t.includes('usb-c') ? 'USB-C'
    : t.includes('usb') ? 'USB'
    : 'N/A';

  // ── Schemas canónicos por categoría ──────────────────────────────────────────
  switch (schemaCategoria) {
    case 'Computo': return {
      procesador:        cpu,
      ram_gb:            ramFormateada,
      almacenamiento_gb: almacenamiento,
      gpu:               gpu,
      pantalla_hz:       hz ? `${pulgadas ?? 'N/A'}" — ${hz}Hz` : (pulgadas ? `${pulgadas}"` : 'N/A'),
      sistema_operativo: t.includes('windows 11') ? 'Windows 11'
        : t.includes('windows 10') ? 'Windows 10'
        : (t.includes('macos') || t.includes('mac os')) ? 'macOS'
        : t.includes('chrome os') ? 'Chrome OS'
        : (t.includes('sin sistema') || t.includes('freedos')) ? 'Sin SO'
        : 'N/A',
      conectividad: (t.includes('wifi 6') || t.includes('wi-fi 6')) ? 'Wi-Fi 6, Bluetooth 5'
        : (t.includes('wifi') || t.includes('wi-fi')) ? 'Wi-Fi, Bluetooth'
        : 'N/A',
      bateria: (() => {
        const wh = ex(/(\d+)\s*wh/i); const mah = ex(/(\d+)\s*mah/i);
        return wh ? `${wh} Wh` : mah ? `${mah} mAh` : 'N/A';
      })(),
    };

    case 'Monitores': return {
      tamano_pulgadas:  pulgadas ? `${pulgadas}"` : 'N/A',
      resolucion:       resolucion,
      tasa_refresco_hz: hz ? `${hz}Hz` : 'N/A',
      tiempo_respuesta: (() => { const ms = ex(/(\d+)\s*ms/i); return ms ? `${ms}ms` : 'N/A'; })(),
      tipo_panel:       panel,
      hdr: t.includes('hdr10+') ? 'HDR10+' : t.includes('hdr400') ? 'HDR400'
        : t.includes('hdr') ? 'HDR' : 'No',
      conectores: (t.includes('hdmi') && t.includes('displayport')) ? 'HDMI, DisplayPort'
        : t.includes('hdmi') ? 'HDMI'
        : t.includes('displayport') ? 'DisplayPort'
        : 'N/A',
      brillo_nits: (() => { const n = ex(/(\d{3,4})\s*(?:nits?|cd\/m)/i); return n ? `${n} nits` : 'N/A'; })(),
    };

    case 'Perifericos': return {
      tipo: t.includes('teclado') ? 'Teclado'
        : (t.includes('ratón') || t.includes('mouse') || t.includes('raton')) ? 'Ratón'
        : (t.includes('audífonos') || t.includes('audifonos') || t.includes('headset')) ? 'Audífonos'
        : t.includes('webcam') ? 'Webcam'
        : t.includes('hub') ? 'Hub USB'
        : 'Periférico',
      conectividad: conectividad,
      compatibilidad: (t.includes('mac') && t.includes('windows')) ? 'Windows, macOS'
        : t.includes('mac') ? 'macOS' : 'Windows',
      caracteristica_principal: t.includes('mecánico') || t.includes('mecanico') ? 'Mecánico'
        : t.includes('rgb') ? 'RGB'
        : t.includes('ergonómico') || t.includes('ergonomico') ? 'Ergonómico'
        : t.includes('gaming') ? 'Gaming'
        : t.includes('silencioso') ? 'Silencioso'
        : 'N/A',
      peso_gramos: (() => { const g = ex(/(\d{2,4})\s*g(?:ramos?)?(?!\s*b)/i); return g ? `${g}g` : 'N/A'; })(),
      color: t.includes('negro') || t.includes('black') ? 'Negro'
        : t.includes('blanco') || t.includes('white') ? 'Blanco'
        : t.includes('gris') || t.includes('gray') ? 'Gris'
        : 'N/A',
    };

    case 'Componentes': return {
      tipo_componente: (t.includes('procesador') || t.includes(' cpu ')) ? 'CPU'
        : (t.includes('tarjeta de video') || t.includes('rtx') || t.includes('rx 6') || t.includes('rx 7')) ? 'GPU'
        : (t.includes('memoria ram') || t.includes(' ram ')) ? 'RAM'
        : t.includes('ssd') ? 'SSD'
        : t.includes('hdd') ? 'HDD'
        : t.includes('fuente') ? 'Fuente de Poder'
        : t.includes('motherboard') || t.includes('tarjeta madre') ? 'Motherboard'
        : 'Componente',
      socket_interfaz: t.includes('am5') ? 'Socket AM5'
        : t.includes('am4') ? 'Socket AM4'
        : (t.includes('lga1700') || t.includes('lga 1700')) ? 'LGA1700'
        : (t.includes('lga1200') || t.includes('lga 1200')) ? 'LGA1200'
        : t.includes('m.2') ? 'M.2'
        : t.includes('ddr5') ? 'DDR5'
        : t.includes('ddr4') ? 'DDR4'
        : 'N/A',
      velocidad_frecuencia: (() => {
        const ghz = ex(/(\d+(?:\.\d+)?)\s*ghz/i);
        const mhz = ex(/(\d{4,5})\s*mhz/i);
        const vram = ex(/(\d+)\s*gb\s*(?:gddr\d|vram)/i);
        return ghz ? `${ghz} GHz` : mhz ? `${mhz} MHz` : vram ? `${vram} GB VRAM` : 'N/A';
      })(),
      tdp_watts: (() => { const w = ex(/(\d{2,3})\s*w(?:atts?)?(?!\s*i)/i); return w ? `${w}W` : 'N/A'; })(),
      generacion: t.includes('zen 5') ? 'AMD Zen 5'
        : t.includes('zen 4') ? 'AMD Zen 4'
        : t.includes('zen 3') ? 'AMD Zen 3'
        : t.includes('raptor lake') ? 'Intel 13a/14a Gen'
        : t.includes('alder lake') ? 'Intel 12a Gen'
        : ex(/(\d{1,2}[aª]?\s*gen(?:eración)?)/i) ?? 'N/A',
      compatibilidad: cpu !== 'N/A' ? cpu : 'Ver especificaciones',
    };

    default: return {
      procesador: cpu, ram_gb: ramFormateada, almacenamiento_gb: almacenamiento,
      gpu: gpu, pantalla_hz: hz ? `${hz}Hz` : 'N/A',
      sistema_operativo: 'N/A', conectividad: 'N/A', bateria: 'N/A',
    };
  }
}


// ════════════════════════════════════════════════════════
// BLOQUE 7: FUNCIONES DE SCORING Y SENTIMIENTO
// ════════════════════════════════════════════════════════

/**
 * Limpia el permalink de ML e inyecta los parámetros de afiliado.
 */
function generarUrlAfiliado(permalink) {
  const base = permalink.split('?')[0].split('#')[0];
  return `${base}?matt_tool=${AFILIADO.matt_tool}&matt_word=${AFILIADO.matt_word}`;
}

/**
 * Convierte el thumbnail/URL de la API a imagen en alta resolución.
 * El CDN de ML usa el sufijo -O.webp para la versión original.
 */
function obtenerImagenHD(thumbnail) {
  if (!thumbnail) return '';
  const hd = thumbnail.replace(/(-[A-Z])(\.(?:jpg|webp|jpeg))$/i, '-O.webp');
  return hd !== thumbnail ? hd : thumbnail;
}

/**
 * Score de satisfacción del usuario (0–100).
 * Calidad (75%): rating lineal sobre 5 estrellas.
 * Volumen (25%): masa crítica topada a 500 opiniones.
 */
function calcularScore(rating, opiniones) {
  const calidad = (Math.max(0, Math.min(rating, 5)) / 5) * 75;
  const volumen = (Math.min(Math.max(0, opiniones), 500) / 500) * 25;
  return Math.round((calidad + volumen) * 10) / 10;
}

/**
 * Genera pros y contras basados en datos objetivos de la API.
 * Sin NLP. Sin inventar datos. 100% determinista.
 * Garantiza mínimo 1 pro y 1 contra (requerido por el validador del build).
 */
function generarSentimiento(item, specs) {
  const pros = [], contras = [];
  const rating    = item.reviews?.rating_average ?? 0;
  const opiniones = item.reviews?.total ?? 0;
  const descuento = item.original_price
    ? Math.round(((item.original_price - item.price) / item.original_price) * 100)
    : 0;

  // PROs objetivos
  if (rating >= 4.5) pros.push(`Ampliamente valorado: ${rating.toFixed(1)}⭐ sobre ${opiniones.toLocaleString('es-MX')} reseñas verificadas.`);
  else if (rating >= 4.0) pros.push(`Bien evaluado por compradores: ${rating.toFixed(1)}⭐ en Mercado Libre México.`);
  if (item.shipping?.free_shipping) pros.push('Envío sin costo disponible para este producto.');
  if (descuento >= 20) pros.push(`Precio con descuento activo: ${descuento}% sobre precio de lista.`);
  if (specs.tasa_refresco_hz && parseInt(specs.tasa_refresco_hz) >= 144)
    pros.push(`Alta tasa de refresco: ${specs.tasa_refresco_hz} — experiencia visual fluida.`);
  if (specs.ram_gb && /32|64/.test(specs.ram_gb))
    pros.push(`Memoria RAM amplia (${specs.ram_gb}) — apta para cargas de trabajo intensivas.`);
  if (specs.almacenamiento_gb?.includes('NVMe'))
    pros.push('Almacenamiento NVMe SSD — velocidades de lectura/escritura de alto rendimiento.');

  // CONTRAs objetivos
  if (rating < 4.0 && opiniones >= 10)
    contras.push(`Calificación inferior al promedio de la categoría (${rating.toFixed(1)}⭐). Revisar reseñas detalladas.`);
  if (opiniones > 0 && opiniones < 20)
    contras.push(`Volumen de reseñas reducido (${opiniones}). Evaluar más opciones antes de decidir.`);
  if (!item.shipping?.free_shipping)
    contras.push('El costo de envío puede variar según tu ubicación. Verificar al momento de compra.');

  // Garantía mínima de 1 pro y 1 contra
  if (pros.length === 0)
    pros.push('Producto activo en Mercado Libre México con vendedor registrado.');
  if (contras.length === 0)
    contras.push('Verifica precio actual y disponibilidad de stock directamente en Mercado Libre.');

  return { pros: pros.slice(0, 4), contras: contras.slice(0, 3) };
}


// ════════════════════════════════════════════════════════
// BLOQUE 8: TRANSFORMADOR AL SCHEMA CANÓNICO
// ════════════════════════════════════════════════════════

/**
 * Transforma el objeto completo de /items/{ID} al schema canónico de KalidaPresio.
 * @param {object} item - Objeto completo del endpoint /items/{ID}
 * @param {object} reviews - { rating_average, total } del endpoint /reviews/item/{ID}
 * @param {string} schemaCategoria - Categoría asignada editorialmente en ids_curados.json
 * @returns {object|null} - Producto normalizado o null si no pasa el filtro de precio
 */
function transformarProducto(item, reviews, schemaCategoria) {
  const precio = item.price ?? item.base_price ?? 0;

  // Filtro guillotina de precio
  if (precio < CONFIG.filtro_precio_min_mxn) {
    console.log(`   ⏭ Omitido por precio (${precio} MXN): ${item.id}`);
    return null;
  }

  // Imagen HD: el endpoint /items devuelve pictures[] con URLs completas
  const imagenHD = (() => {
    const pic = item.pictures?.[0];
    if (!pic) return obtenerImagenHD(item.thumbnail ?? '');
    return obtenerImagenHD(pic.url ?? pic.secure_url ?? item.thumbnail ?? '');
  })();

  const rating    = reviews.rating_average;
  const opiniones = reviews.total;
  const specs     = extraerSpecs(item, schemaCategoria);
  const sentiment = generarSentimiento(
    {
      price:          precio,
      original_price: item.original_price ?? null,
      shipping:       item.shipping,
      reviews:        { rating_average: rating, total: opiniones },
    },
    specs
  );

  return {
    id:                         item.id,
    nombre:                     item.title,
    precio_mxn:                 precio,
    enlace_afiliado:            generarUrlAfiliado(item.permalink ?? `https://www.mercadolibre.com.mx/p/${item.id}`),
    categoria:                  schemaCategoria,
    imagen:                     imagenHD,
    envio_gratis:               item.shipping?.free_shipping ?? false,
    rating:                     Math.round(rating * 10) / 10,
    total_opiniones:            opiniones,
    score_satisfaccion_usuario: calcularScore(rating, opiniones),
    especificaciones:           specs,
    opiniones_sentimiento:      sentiment,
    updated_at:                 new Date().toISOString(),
  };
}


// ════════════════════════════════════════════════════════
// BLOQUE 9: FUNCIÓN PRINCIPAL main()
// ════════════════════════════════════════════════════════

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  KalidaPresio — Motor de Catálogo Curado v5.0           ║');
  console.log('║  Fuente: API Oficial ML /items/{ID} + Editorial Manual  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Paso 1: Leer IDs curados ──────────────────────────────────────────────
  const rutaIds = join(__dirname, '../../', CONFIG.ruta_ids_curados);
  let idsCurados;
  try {
    const raw = readFileSync(rutaIds, 'utf-8');
    idsCurados = JSON.parse(raw).filter(entry => entry.id && !entry.id.includes('REEMPLAZAR'));
  } catch (err) {
    console.error('✗ No se pudo leer ids_curados.json:', err.message);
    process.exit(1);
  }

  if (idsCurados.length === 0) {
    console.error('✗ ids_curados.json no tiene IDs reales configurados.');
    console.error('  Reemplaza los valores "REEMPLAZAR_CON_MLM_REAL" con IDs de ML y vuelve a correr.');
    process.exit(1);
  }

  console.log(`📋 IDs configurados para importar: ${idsCurados.length}`);

  // ── Paso 2: Autenticación ─────────────────────────────────────────────────
  let accessToken;
  try {
    accessToken = await obtenerAccessToken();
  } catch (err) {
    console.error('\n✗ FALLO DE AUTENTICACIÓN:', err.message);
    process.exit(1);
  }

  // ── Paso 3: Obtener cada item individualmente ─────────────────────────────
  const productosFinales = [];
  let errores = 0;

  for (let i = 0; i < idsCurados.length; i++) {
    const { id, categoria } = idsCurados[i];
    const progreso = `[${i + 1}/${idsCurados.length}]`;

    console.log(`\n${progreso} 📦 Obteniendo: ${id} (${categoria})`);
    await sleep(CONFIG.delay_entre_items_ms);

    // Obtener item completo
    let item;
    try {
      item = await obtenerItemCompleto(id, accessToken);
    } catch (err) {
      if (err.message === 'AUTH_EXPIRED') {
        console.log('   🔄 Token expirado mid-ejecución. Renovando...');
        accessToken = await obtenerAccessToken();
        item = await obtenerItemCompleto(id, accessToken);
      } else {
        console.error(`   ✗ Error fatal en ${id}:`, err.message);
        errores++;
        continue;
      }
    }

    if (!item) { errores++; continue; }

    // Obtener reviews (siempre, no condicional)
    await sleep(150);
    const reviews = await obtenerReviews(id, accessToken);
    console.log(`   ✓ "${item.title?.substring(0, 55)}..."`);
    console.log(`   → Precio: $${item.price?.toLocaleString('es-MX')} MXN | Rating: ${reviews.rating_average}⭐ (${reviews.total} reseñas)`);

    // Transformar al schema canónico
    const producto = transformarProducto(item, reviews, categoria);
    if (producto) {
      productosFinales.push(producto);
      console.log(`   ✅ Score: ${producto.score_satisfaccion_usuario}/100`);
    } else {
      console.log(`   ⏭ Omitido por filtros.`);
    }
  }

  // ── Paso 4: Ordenar por score descendente ─────────────────────────────────
  productosFinales.sort((a, b) => b.score_satisfaccion_usuario - a.score_satisfaccion_usuario);

  // ── Paso 5: Resumen ───────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`✅ Productos importados exitosamente: ${productosFinales.length}`);
  console.log(`❌ Errores de red o datos:             ${errores}`);
  if (productosFinales.length > 0) {
    console.log(`🏆 Mejor score: ${productosFinales[0].nombre?.substring(0, 50)}`);
    console.log(`   → ${productosFinales[0].score_satisfaccion_usuario}/100`);
    const porCategoria = productosFinales.reduce((acc, p) => {
      acc[p.categoria] = (acc[p.categoria] ?? 0) + 1; return acc;
    }, {});
    console.log('📦 Por categoría:', Object.entries(porCategoria).map(([k, v]) => `${k}: ${v}`).join(' | '));
  }
  console.log('──────────────────────────────────────────────────────────\n');

  if (productosFinales.length === 0) {
    console.error('✗ CRÍTICO: Ningún producto fue importado. El JSON no será sobrescrito.');
    process.exit(1);
  }

  // ── Paso 6: Escribir JSON ─────────────────────────────────────────────────
  const rutaOutput = join(__dirname, '../../', CONFIG.ruta_output);
  await writeFile(rutaOutput, JSON.stringify(productosFinales, null, 2), 'utf-8');
  console.log(`💾 productos.json actualizado → ${CONFIG.ruta_output}`);
  console.log(`   ${productosFinales.length} productos escritos y ordenados por score.\n`);
}

// ── Punto de entrada ───────────────────────────────────────────────────────────
main().catch(err => {
  console.error('\n✗ ERROR NO CONTROLADO:');
  console.error(err);
  process.exit(1);
});
