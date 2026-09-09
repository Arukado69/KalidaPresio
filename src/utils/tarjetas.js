/**
 * tarjetas — cómo se ve una tarjeta de promoción. Sin disco, sin red.
 *
 * ── POR QUÉ VIVE AQUÍ Y NO EN EL SCRIPT ────────────────────────────────────
 * La primera versión tenía estas funciones dentro de generarTarjetasPromo.js,
 * al lado del `main()` que descarga fotos y escribe PNG. Importarlas desde un
 * test ejecutaba ese main: en CI, donde feed.json no existe por estar en
 * .gitignore, el script llamaba a `process.exit(1)` y tumbaba la suite entera.
 * La guarda de «solo al ejecutar directo» no basta bajo vitest.
 *
 * La regla del repo ya lo decía: en src/utils/ va la lógica pura y testeada.
 * Un módulo que se puede importar sin que ocurra nada es un módulo que se
 * puede probar.
 *
 * ── LAS DOS VARIANTES ──────────────────────────────────────────────────────
 * Comparten marco a propósito. Si el post que DESENMASCARA se ve tan nuestro
 * como el que RECOMIENDA, los dos construyen la misma reputación:
 *
 *   · oferta   → franja verde. El precio manda; el veredicto lo respalda.
 *   · mentira  → franja roja. La acusación manda; el precio es el detalle.
 */

// ── Lienzo ─────────────────────────────────────────────────────────────────
// 4:5 es el formato que más alto ocupa en un feed sin que lo recorten, y es
// el que Telegram muestra completo sin obligar a tocar la imagen.
export const ANCHO = 1080;
export const ALTO = 1350;
export const FOTO_ALTO = 620;
export const BANDA_ALTO = 132;

// ── Paleta (la misma de src/styles/global.css; si cambia allí, cambia aquí) ──
export const FONDO = '#170533';
const SUPERFICIE = '#1F0742';
const VIOLETA = '#280455';
const VERDE = '#1fd28e';
const ROJO = '#ff5d76';
const TEXTO = '#f0eef8';
const TENUE = '#a59cc4';
const AMBAR = '#f6d14f';

/** Escapa lo que XML no perdona dentro de un nodo de texto. */
export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const pesos = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(
    Number(n) || 0,
  );

/**
 * Parte un texto en líneas por ancho aproximado.
 *
 * No se puede medir tipografía dentro de un SVG que aún no se ha rasterizado,
 * así que se estima por número de caracteres. El 0.62 sale de medir el render
 * real: con 0.52 el título se salía del lienzo, porque la sans-serif que
 * resuelve un contenedor sin fuentes instaladas es más ancha de lo que se
 * supone. Se queda corto a propósito — una línea que se sale se ve mucho peor
 * que una que deja aire.
 */
export function partirLineas(texto, tamano, anchoMax, maxLineas) {
  const porLinea = Math.floor(anchoMax / (tamano * 0.62));
  const palabras = String(texto ?? '').split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';

  for (const p of palabras) {
    const tentativa = actual ? `${actual} ${p}` : p;
    if (tentativa.length <= porLinea) {
      actual = tentativa;
    } else {
      if (actual) lineas.push(actual);
      actual = p;
      if (lineas.length === maxLineas) break;
    }
  }
  if (actual && lineas.length < maxLineas) lineas.push(actual);

  // Si sobró texto, el corte se marca: es más honesto que dejarlo colgando.
  if (lineas.length === maxLineas) {
    const cabe = palabras.join(' ').length > lineas.join(' ').length;
    if (cabe) lineas[maxLineas - 1] = lineas[maxLineas - 1].replace(/[\s,.;:-]+$/, '') + '…';
  }
  return lineas;
}

/**
 * El degradado de fondo. Va DEBAJO de la foto del producto.
 *
 * Está separado del marco porque la primera versión pintaba su fondo sobre
 * TODO el lienzo en la misma capa que el texto, después de componer la foto:
 * la tapaba por completo y las tarjetas salían sin producto.
 */
export function svgFondo() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}">
  <defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${FONDO}"/><stop offset="100%" stop-color="${VIOLETA}"/>
  </linearGradient></defs>
  <rect width="${ANCHO}" height="${ALTO}" fill="url(#f)"/>
</svg>`;
}

/**
 * El marco con todo el texto. Va ENCIMA de la foto.
 *
 * @param {object} o — item de feed.json
 * @param {boolean} esMentira — variante de descuento falso
 * @returns {string} SVG
 */
export function svgTarjeta(o, esMentira) {
  const acento = esMentira ? ROJO : VERDE;
  const etiqueta = esMentira ? 'EL DESCUENTO NO ES REAL' : 'CALIDAD-PRECIO VERIFICADO';

  const titulo = partirLineas(o.titulo, 38, 980, 2);
  const veredicto = o.historico?.texto ?? '';
  const lineasVer = partirLineas(veredicto, 40, 940, 2);

  const yContenido = BANDA_ALTO + FOTO_ALTO;
  const ahorro = Number(o.precio_previo) - Number(o.precio_actual);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
  <defs>
    <linearGradient id="velo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${FONDO}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${FONDO}" stop-opacity="0.92"/>
    </linearGradient>
  </defs>

  <!-- Banda superior: la marca y de qué va este post -->
  <rect width="${ANCHO}" height="${BANDA_ALTO}" fill="${SUPERFICIE}"/>
  <rect width="${ANCHO}" height="7" y="${BANDA_ALTO - 7}" fill="${acento}"/>
  <text x="56" y="60" font-family="sans-serif" font-size="34" font-weight="bold" fill="${TEXTO}" letter-spacing="3">KALIDA<tspan fill="${acento}">PRESIO</tspan></text>
  <text x="56" y="100" font-family="sans-serif" font-size="23" fill="${TENUE}" letter-spacing="2.5">${esc(etiqueta)}</text>

  <!-- Velo bajo la foto, para que el contenido siempre se lea -->
  <rect y="${yContenido - 190}" width="${ANCHO}" height="190" fill="url(#velo)"/>

  <!-- Contenido -->
  <rect y="${yContenido}" width="${ANCHO}" height="${ALTO - yContenido}" fill="${FONDO}"/>

  ${titulo
    .map(
      (l, i) =>
        `<text x="56" y="${yContenido + 62 + i * 50}" font-family="sans-serif" font-size="38" fill="${TEXTO}">${esc(l)}</text>`,
    )
    .join('\n  ')}

  <!-- Precio: el titular en la variante buena, el detalle en la de mentira -->
  <text x="56" y="${yContenido + 232}" font-family="sans-serif" font-size="${esMentira ? 76 : 104}" font-weight="bold" fill="${TEXTO}">${esc(pesos(o.precio_actual))}</text>
  ${
    Number(o.precio_previo) > Number(o.precio_actual)
      ? `<text x="${esMentira ? 300 : 400}" y="${yContenido + 232}" font-family="sans-serif" font-size="40" fill="${TENUE}" text-decoration="line-through">${esc(pesos(o.precio_previo))}</text>
  ${
    esMentira
      ? `<text x="${300}" y="${yContenido + 270}" font-family="sans-serif" font-size="24" fill="${ROJO}">precio &quot;anterior&quot; que nunca vimos</text>`
      : `<text x="${400}" y="${yContenido + 270}" font-family="sans-serif" font-size="26" fill="${VERDE}">ahorras ${esc(pesos(ahorro))}</text>`
  }`
      : ''
  }

  <!-- Insignia de descuento -->
  <rect x="${ANCHO - 216}" y="${yContenido + 170}" width="160" height="82" rx="16" fill="${acento}"/>
  <text x="${ANCHO - 136}" y="${yContenido + 226}" font-family="sans-serif" font-size="46" font-weight="bold" fill="${FONDO}" text-anchor="middle">-${esc(o.descuento)}%</text>

  <!-- El veredicto: esto es lo que nadie más puede escribir -->
  <rect x="56" y="${yContenido + 312}" width="${ANCHO - 112}" height="${lineasVer.length > 1 ? 122 : 84}" rx="18" fill="${acento}" fill-opacity="0.14"/>
  <rect x="56" y="${yContenido + 312}" width="7" height="${lineasVer.length > 1 ? 122 : 84}" rx="3" fill="${acento}"/>
  ${lineasVer
    .map(
      (l, i) =>
        `<text x="88" y="${yContenido + 364 + i * 44}" font-family="sans-serif" font-size="34" font-weight="bold" fill="${acento}">${esc(l)}</text>`,
    )
    .join('\n  ')}

  <!-- Pie: el sello y la prueba social -->
  <text x="56" y="${ALTO - 74}" font-family="sans-serif" font-size="26" fill="${TENUE}">Sello K-P <tspan fill="${AMBAR}" font-weight="bold">${esc(o.score)}</tspan>   ·   ${esc(o.rating ?? '—')}★   ·   ${esc(Number(o.vendidos) >= 1000 ? `+${Math.round(Number(o.vendidos) / 1000)} mil vendidos` : `${o.vendidos ?? 0} vendidos`)}</text>
  <text x="56" y="${ALTO - 34}" font-family="sans-serif" font-size="26" fill="${acento}" fill-opacity="0.75">kalidapresio.albis-labs.xyz</text>
</svg>`;
}
