/**
 * identidad — La «K» de KalidaPresio y la imagen para compartir el sitio.
 *
 * De aquí salen (con `npm run generar-identidad`, una vez; se versionan):
 *   · public/favicon.svg y favicon.ico      → la pestaña del navegador
 *   · public/apple-touch-icon.png           → acceso directo en iPhone
 *   · public/iconos/kp-*.png                → la app del panel (Android)
 *   · public/og-default.png                 → la vista previa en WhatsApp,
 *                                             Facebook, X…
 *
 * La «K» va dibujada con figuras, no con texto: un favicon SVG no puede
 * cargar fuentes, y así se ve igual en todas partes. La imagen para
 * compartir sí usa las fuentes de la marca (src/assets/fuentes), que el
 * generador le da a sharp con un fonts.conf propio.
 *
 * Funciones PURAS: devuelven SVG.
 */
import { esc } from './tarjetas.js';

const PAPEL = '#f3ede0';
const TINTA = '#17140f';
const TINTA_2 = '#4a443a';
const FOSFO = '#e6ff2a';
const ROSA = '#ff5cae';
const ROJO = '#c21f2a';
const VERDE = '#0a6e39';

/**
 * La letra K en una caja de 128×128: el asta, el brazo y la pierna. La pierna
 * nace DENTRO del brazo (57,62) para que no quede una muesca en la unión.
 * Ocupa x 28..105 (va un poco a la derecha del centro porque el asta pesa).
 */
const K = `<rect x="28" y="27" width="21" height="74"/>
    <polygon points="49,56 79,27 105,27 49,83"/>
    <polygon points="57,62 105,101 77,101 45,76"/>`;

/**
 * La «K» en su cartulina fosforescente.
 *
 * @param {number} tamano — lado en px del SVG
 * @param {{maskable?: boolean}} [opciones] — maskable: fondo a sangre y la
 *   letra dentro de la zona segura (Android recorta el ícono en círculo).
 */
export function svgMarcaK(tamano, { maskable = false } = {}) {
  const caja = maskable
    ? `<rect width="128" height="128" fill="${FOSFO}"/>`
    : `<rect x="5" y="5" width="118" height="118" rx="24" fill="${FOSFO}" stroke="${TINTA}" stroke-width="8"/>`;
  // La zona segura de un ícono maskable es el círculo central del 80 %
  // (102 de 128): la K (77×74) se achica a 0.8 para que sus esquinas quepan.
  const letra = maskable
    ? `<g transform="translate(64 64) scale(0.8) translate(-66.5 -64)" fill="${TINTA}">${K}</g>`
    : `<g fill="${TINTA}">${K}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamano}" height="${tamano}" viewBox="0 0 128 128">
  ${caja}
  ${letra}
</svg>`;
}

/**
 * La imagen para compartir el sitio (1200×630), con la marca nueva: la misma
 * pregunta que la portada, con su tachón sobre «CUENTO».
 *
 * Las posiciones están medidas con las fuentes reales (Big Shoulders a 124 px:
 * «¿DESCUENTAZO» termina en x≈752 y «O PURO CUENTO?» en x≈832; «CUENTO» va de
 * x≈430 a 771). La columna derecha empieza en 873 para que nada se encime.
 */
export function svgOg() {
  const ROTULO = `font-family="Big Shoulders Display" font-weight="900"`;
  const PLUMON = `font-family="Permanent Marker"`;
  const TEXTO = (peso) => `font-family="Schibsted Grotesk" font-weight="${peso}"`;
  const marca = svgMarcaK(128).replace(/^<svg[^>]*>|<\/svg>\s*$/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PAPEL}"/>

  <!-- La marca -->
  <g transform="translate(70 58) scale(0.62)">${marca}</g>
  <text x="166" y="118" ${ROTULO} font-size="58" fill="${TINTA}">KALIDA<tspan fill="${ROJO}">PRESIO</tspan></text>

  <!-- La pregunta de la portada -->
  <text x="70" y="285" ${ROTULO} font-size="124" fill="${TINTA}">¿DESCUENTAZO</text>
  <text x="70" y="415" ${ROTULO} font-size="124" fill="${TINTA}">O PURO <tspan fill="${ROJO}">CUENTO</tspan>?</text>
  <path d="M424 392 C 512 352, 640 402, 778 356" fill="none" stroke="${TINTA}" stroke-width="11" stroke-linecap="round"/>

  <g ${TEXTO(500)} font-size="28" fill="${TINTA_2}">
    <text x="72" y="482">${esc('Ofertas de Mercado Libre revisadas a mano:')}</text>
    <text x="72" y="520">${esc('cada precio con su fecha, y te decimos cuándo')}</text>
    <text x="72" y="558">${esc('el descuento es puro cuento.')}</text>
  </g>

  <!-- La cartulina y el sello -->
  <g transform="rotate(5 1015 240)">
    <rect x="880" y="150" width="270" height="180" fill="${ROSA}" stroke="${TINTA}" stroke-width="4"/>
    <text x="1015" y="258" ${ROTULO} font-size="88" fill="${TINTA}" text-anchor="middle">¿REAL?</text>
    <text x="1015" y="308" ${PLUMON} font-size="28" fill="${TINTA}" text-anchor="middle">sí, lo revisamos</text>
  </g>
  <g transform="rotate(-9 1000 455)">
    <rect x="835" y="410" width="330" height="90" rx="8" fill="none" stroke="${VERDE}" stroke-width="8"/>
    <text x="1000" y="476" ${ROTULO} font-size="56" fill="${VERDE}" text-anchor="middle" letter-spacing="2">PRECIO REAL</text>
  </g>
  <text x="1130" y="600" ${TEXTO(700)} font-size="24" fill="${TINTA_2}" text-anchor="end">kalidapresio.albis-labs.xyz</text>
</svg>`;
}

/**
 * Un .ico con PNG adentro (lo aceptan todos los navegadores desde 2009).
 * @param {{tamano: number, png: Uint8Array}[]} imagenes
 * @returns {Uint8Array}
 */
export function icoDePngs(imagenes) {
  const cabecera = 6;
  const entrada = 16;
  let desplazamiento = cabecera + entrada * imagenes.length;
  const total = desplazamiento + imagenes.reduce((n, i) => n + i.png.length, 0);
  const salida = new Uint8Array(total);
  const vista = new DataView(salida.buffer);
  vista.setUint16(0, 0, true); // reservado
  vista.setUint16(2, 1, true); // tipo: ícono
  vista.setUint16(4, imagenes.length, true);
  imagenes.forEach((img, k) => {
    const e = cabecera + entrada * k;
    vista.setUint8(e, img.tamano >= 256 ? 0 : img.tamano);
    vista.setUint8(e + 1, img.tamano >= 256 ? 0 : img.tamano);
    vista.setUint8(e + 2, 0); // sin paleta
    vista.setUint8(e + 3, 0);
    vista.setUint16(e + 4, 1, true); // planos
    vista.setUint16(e + 6, 32, true); // bits por pixel
    vista.setUint32(e + 8, img.png.length, true);
    vista.setUint32(e + 12, desplazamiento, true);
    salida.set(img.png, desplazamiento);
    desplazamiento += img.png.length;
  });
  return salida;
}
