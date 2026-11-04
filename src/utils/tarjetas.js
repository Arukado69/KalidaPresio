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
 *   · oferta   → sello verde. El precio manda; el veredicto lo respalda.
 *   · mentira  → sello rojo «PURO CUENTO». La acusación manda.
 *
 * ── LOS DOS FORMATOS ───────────────────────────────────────────────────────
 *   · post     (4:5, 1080×1350) → feed de Telegram, WhatsApp, Facebook.
 *   · historia (9:16, 1080×1920) → estados de WhatsApp, historias de
 *     Instagram/Facebook y TikTok. Lleva el CÓDIGO FIJO del producto
 *     («K-17», src/utils/codigos.js), porque ahí el link no se puede tocar:
 *     «link en mi perfil, el K-17». El código no cambia con la vitrina.
 *
 * ── LA MARCA ───────────────────────────────────────────────────────────────
 * La misma del sitio («el tianguis honesto», src/styles/global.css): papel,
 * tinta, el precio a plumón en cartulina fosforescente y sellos de hule. Las
 * fuentes viajan en el repo (src/assets/fuentes) y el generador se las da a
 * sharp con un fonts.conf propio (confFuentes): así el texto se dibuja igual
 * en tu computadora que en el contenedor del VPS, que no trae fuentes.
 */
import { formatoCodigo, normalizarCodigo } from './codigos.js';
import { pesos } from './pesos.js';

// ── Lienzo ─────────────────────────────────────────────────────────────────
// 4:5 es el formato que más alto ocupa en un feed sin que lo recorten, y es
// el que Telegram muestra completo sin obligar a tocar la imagen.
export const ANCHO = 1080;
export const ALTO = 1350;
export const FOTO_ALTO = 620;
export const BANDA_ALTO = 132;

// ── Paleta (la de src/styles/global.css; si cambia allí, cambia aquí) ───────
const PAPEL = '#f3ede0';
const HOJA = '#fffcf4';
const TINTA = '#17140f';
const TINTA_2 = '#4a443a';
const TINTA_3 = '#857c6c';
const PAPEL_2 = '#e8e0cd';
const FOSFO = '#e6ff2a';
const NARANJA = '#ff8b2c';
const ROJO = '#c21f2a';
const VERDE = '#0a6e39';
/** El color de fondo del lienzo (lo usa el generador al crear la imagen). */
export const FONDO = PAPEL;

// ── Fuentes (src/assets/fuentes) ───────────────────────────────────────────
// Solo caracteres que estas fuentes tienen: la estrella ★ NO está, por eso se
// dibuja (estrella()). Un carácter que falta sale como un cuadrito.
const ROTULO = `font-family="Big Shoulders Display" font-weight="900"`;
const PLUMON = `font-family="Permanent Marker"`;
const TEXTO = (peso = 400) => `font-family="Schibsted Grotesk" font-weight="${peso}"`;

/**
 * El fonts.conf que le da a sharp SOLO las fuentes del repo. Rutas absolutas.
 * @param {string} dirFuentes — carpeta con los .ttf
 * @param {string} dirCache — carpeta escribible para la caché de fontconfig
 */
export function confFuentes(dirFuentes, dirCache) {
  return `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${esc(dirFuentes)}</dir>
  <cachedir>${esc(dirCache)}</cachedir>
</fontconfig>
`;
}

/** Escapa lo que XML no perdona dentro de un nodo de texto. */
export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Con centavos si los tiene: $99.59 nunca sale como «$100» (src/utils/pesos.js).
export { pesos };

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

/** Una estrella de 5 picos (la ★ no existe en las fuentes de la marca). */
function estrella(cx, cy, r, color) {
  const puntos = [];
  for (let k = 0; k < 10; k++) {
    const radio = k % 2 === 0 ? r : r * 0.45;
    const ang = -Math.PI / 2 + (k * Math.PI) / 5;
    puntos.push(`${(cx + radio * Math.cos(ang)).toFixed(1)},${(cy + radio * Math.sin(ang)).toFixed(1)}`);
  }
  return `<polygon points="${puntos.join(' ')}" fill="${color}"/>`;
}

/**
 * Sin foto (un producto pegado desde «Compartir» todavía no la tiene): un
 * letrero con la categoría sobre rayas, como en el sitio, no un hueco.
 */
function sinFoto(o, x, y, ancho, alto, tamano) {
  const cat = String(o.categoria && o.categoria !== 'Otros' ? o.categoria : 'Oferta').toUpperCase();
  return `<defs><pattern id="rayas" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="22" height="44" fill="${PAPEL_2}"/></pattern></defs>
  <rect x="${x}" y="${y}" width="${ancho}" height="${alto}" fill="${PAPEL}"/>
  <rect x="${x}" y="${y}" width="${ancho}" height="${alto}" fill="url(#rayas)"/>
  <text x="${x + ancho / 2}" y="${y + alto / 2 + tamano * 0.35}" ${ROTULO} font-size="${tamano}" fill="${TINTA_3}" text-anchor="middle" transform="rotate(-6 ${x + ancho / 2} ${y + alto / 2})">${esc(cat)}</text>`;
}

/** Ancho aproximado de un texto (sin medir: el SVG aún no se rasteriza). */
const anchoTexto = (t, tamano, factor) => String(t).length * tamano * factor;

/** «+250 mil vendidos» / «840 vendidos». */
function vendidosTexto(v) {
  const n = Number(v) || 0;
  return n >= 1000 ? `+${Math.round(n / 1000)} mil vendidos` : `${n} vendidos`;
}

/**
 * El papel de fondo. Va DEBAJO de la foto del producto.
 *
 * Está separado del marco porque la primera versión pintaba su fondo sobre
 * TODO el lienzo en la misma capa que el texto, después de componer la foto:
 * la tapaba por completo y las tarjetas salían sin producto.
 */
export function svgFondo(alto = ALTO) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${alto}">
  <rect width="${ANCHO}" height="${alto}" fill="${PAPEL}"/>
</svg>`;
}

/**
 * El marco con todo el texto del post 4:5. Va ENCIMA de la foto.
 *
 * @param {object} o — item de feed.json
 * @param {boolean} esMentira — variante de descuento falso
 * @returns {string} SVG
 */
export function svgTarjeta(o, esMentira) {
  const sello = esMentira ? ROJO : VERDE;
  const etiqueta = esMentira ? 'EL DESCUENTO NO ES REAL' : 'CALIDAD-PRECIO VERIFICADO';
  const codigo = formatoCodigo(o.codigo);

  const titulo = partirLineas(o.titulo, 38, 980, 2);
  // El veredicto del histórico manda; si no hay, tu nota. Si no hay ninguno,
  // el sello no se dibuja (antes salía un recuadro vacío).
  const veredicto = o.historico?.texto || o.nota || '';
  const lineasVer = partirLineas(veredicto.toUpperCase(), 40, 900, 2);

  const y0 = BANDA_ALTO + FOTO_ALTO;
  const precio = pesos(o.precio_actual);
  const tienePrevio = Number(o.precio_previo) > Number(o.precio_actual);
  const anchoEtiqueta = Math.min(620, anchoTexto(precio, esMentira ? 84 : 104, 0.62) + 70);
  const yPrecio = y0 + 248;
  // El tachón cubre solo el precio viejo, no la palabra «antes».
  const anchoPrevio = tienePrevio ? anchoTexto(pesos(o.precio_previo), 32, 0.54) : 0;
  const anchoCodigo = codigo ? anchoTexto(codigo, 52, 0.48) + 48 : 0;
  const alturaSello = lineasVer.length > 1 ? 128 : 84;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
  ${o.imagen ? '' : sinFoto(o, 0, BANDA_ALTO, ANCHO, FOTO_ALTO, 150)}
  <!-- Banda de tinta: la marca, de qué va y el código fijo -->
  <rect width="${ANCHO}" height="${BANDA_ALTO}" fill="${TINTA}"/>
  <text x="56" y="76" ${ROTULO} font-size="62" fill="${PAPEL}">KALIDA<tspan fill="${FOSFO}">PRESIO</tspan></text>
  <text x="58" y="112" ${TEXTO(700)} font-size="21" fill="${esMentira ? '#ff8f97' : FOSFO}" letter-spacing="3">${esc(etiqueta)}</text>
  ${codigo ? `<rect x="${ANCHO - 56 - anchoCodigo}" y="30" width="${anchoCodigo}" height="72" rx="36" fill="${FOSFO}"/>
  <text x="${ANCHO - 56 - anchoCodigo / 2}" y="86" ${ROTULO} font-size="56" fill="${TINTA}" text-anchor="middle">${esc(codigo)}</text>` : ''}
  <rect y="${y0 - 5}" width="${ANCHO}" height="5" fill="${TINTA}"/>
  ${esMentira ? `<g transform="rotate(-8 ${ANCHO - 260} ${y0 - 110})">
    <rect x="${ANCHO - 470}" y="${y0 - 168}" width="420" height="116" rx="8" fill="${HOJA}" fill-opacity="0.82" stroke="${ROJO}" stroke-width="9"/>
    <text x="${ANCHO - 260}" y="${y0 - 86}" ${ROTULO} font-size="70" fill="${ROJO}" text-anchor="middle" letter-spacing="2">PURO CUENTO</text>
  </g>` : ''}

  <!-- El título -->
  ${titulo.map((l, i) => `<text x="56" y="${y0 + 62 + i * 48}" ${TEXTO(700)} font-size="38" fill="${TINTA}">${esc(l)}</text>`).join('\n  ')}

  <!-- El precio a plumón, en su cartulina (blanca si el descuento es puro cuento) -->
  <g transform="rotate(-2 ${56 + anchoEtiqueta / 2} ${yPrecio - 40})">
    <rect x="48" y="${yPrecio - 118}" width="${anchoEtiqueta}" height="150" fill="${esMentira ? HOJA : FOSFO}" stroke="${TINTA}" stroke-width="3"/>
    <text x="${48 + anchoEtiqueta / 2}" y="${yPrecio}" ${PLUMON} font-size="${esMentira ? 84 : 104}" fill="${TINTA}" text-anchor="middle">${esc(precio)}</text>
  </g>
  ${Number(o.descuento) > 0 ? `<rect x="${ANCHO - 236}" y="${y0 + 136}" width="180" height="86" rx="6" fill="${TINTA}"/>
  <text x="${ANCHO - 146}" y="${y0 + 202}" ${ROTULO} font-size="64" fill="${FOSFO}" text-anchor="middle">-${esc(o.descuento)}%</text>` : ''}
  ${tienePrevio ? `<text x="${ANCHO - 56}" y="${y0 + 270}" ${TEXTO(600)} font-size="32" fill="${TINTA_2}" text-anchor="end">antes ${esc(pesos(o.precio_previo))}</text>
  <line x1="${ANCHO - 62 - anchoPrevio}" y1="${y0 + 266}" x2="${ANCHO - 50}" y2="${y0 + 254}" stroke="${ROJO}" stroke-width="5" stroke-linecap="round"/>
  ${esMentira ? `<text x="${ANCHO - 56}" y="${y0 + 306}" ${TEXTO(700)} font-size="24" fill="${ROJO}" text-anchor="end">un precio «anterior» que nunca vimos</text>` : ''}` : ''}

  <!-- El veredicto como sello de hule: esto es lo que nadie más puede escribir -->
  ${lineasVer.length ? `<g transform="rotate(-1.5 ${ANCHO / 2} ${y0 + 340 + alturaSello / 2})">
    <rect x="56" y="${y0 + 330}" width="${ANCHO - 112}" height="${alturaSello}" rx="8" fill="none" stroke="${sello}" stroke-width="6"/>
    ${lineasVer.map((l, i) => `<text x="${ANCHO / 2}" y="${y0 + 386 + i * 46}" ${ROTULO} font-size="42" fill="${sello}" text-anchor="middle" letter-spacing="1.5">${esc(l)}</text>`).join('\n    ')}
  </g>` : ''}

  <!-- Pie: el sello K-P y la prueba social -->
  <text x="56" y="${ALTO - 74}" ${TEXTO(700)} font-size="27" fill="${TINTA}">${o.calificado === false ? 'SIN CALIFICAR TODAVÍA' : `SELLO K-P ${esc(o.score ?? '—')}`}</text>
  ${Number(o.rating) > 0 ? `${estrella(262, ALTO - 83, 14, TINTA)}
  <text x="282" y="${ALTO - 74}" ${TEXTO(600)} font-size="27" fill="${TINTA_2}">${esc(Number(o.rating).toFixed(1))}  ·  ${esc(vendidosTexto(o.vendidos))}</text>` : ''}
  <text x="56" y="${ALTO - 34}" ${TEXTO(400)} font-size="25" fill="${TINTA_2}">kalidapresio.albis-labs.xyz${codigo ? `/k/${esc(normalizarCodigo(o.codigo))}` : ''} · enlace de afiliado</text>
</svg>`;
}

// ── Historia 9:16 ──────────────────────────────────────────────────────────
// Instagram y TikTok tapan ~250 px arriba y abajo con su propia interfaz: lo
// importante (precio, número) va dentro de la franja segura.
export const HISTORIA_ALTO = 1920;
export const HISTORIA_FOTO_Y = 250;
// 800 y no más: con un título de 3 líneas, precio, precio anterior y hora de
// fin, cualquier foto más alta empuja la hora de fin encima del botón.
export const HISTORIA_FOTO_ALTO = 800;

/**
 * «26 oct · 23:00» en hora de CDMX. Absoluta a propósito: la imagen se
 * descarga y se publica horas después del build, y un «hoy» horneado mentiría.
 * @param {string|null|undefined} iso
 * @returns {string|null}
 */
export function finAbsoluto(iso) {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return null;
  const f = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(t));
  const v = (tipo) => f.find((p) => p.type === tipo)?.value ?? '';
  return `${v('day')} ${v('month').replace('.', '')} · ${v('hour')}:${v('minute')}`;
}

/**
 * El marco de la historia vertical. Va ENCIMA de la foto.
 *
 * @param {object} o — item de feed.json (esquema 2)
 * @returns {string} SVG
 */
export function svgHistoria(o) {
  const relampago = Boolean(o.relampago);
  const acento = relampago ? NARANJA : FOSFO;
  const etiqueta = relampago ? 'OFERTA RELÁMPAGO' : 'CALIDAD-PRECIO VERIFICADO';
  // El código fijo; si la entrada no lo trae, la posición de hoy en /hoy.
  const codigo = formatoCodigo(o.codigo) ?? (o.numero ? `#${o.numero}` : null);
  const corto = normalizarCodigo(o.codigo) ? `/k/${normalizarCodigo(o.codigo)}` : '/hoy';
  const titulo = partirLineas(o.titulo, 50, 968, 3);
  const y = HISTORIA_FOTO_Y + HISTORIA_FOTO_ALTO + 40;
  const fin = relampago ? finAbsoluto(o.termina) : null;
  const tienePrevio = Number(o.precio_previo) > Number(o.precio_actual);
  const yPrecio = y + 60 + titulo.length * 62 + 110;
  const precio = pesos(o.precio_actual);
  const anchoEtiqueta = Math.min(900, anchoTexto(precio, 130, 0.62) + 80);
  const anchoCodigo = codigo ? anchoTexto(codigo, 84, 0.48) + 64 : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${HISTORIA_ALTO}" viewBox="0 0 ${ANCHO} ${HISTORIA_ALTO}">
  <!-- Marca, de qué va y el código fijo (dentro de la franja segura) -->
  <text x="56" y="160" ${ROTULO} font-size="84" fill="${TINTA}">KALIDA<tspan fill="${ROJO}">PRESIO</tspan></text>
  <text x="60" y="208" ${TEXTO(700)} font-size="28" fill="${relampago ? ROJO : TINTA_2}" letter-spacing="3">${esc(etiqueta)}</text>
  ${codigo ? `<rect x="${ANCHO - 56 - anchoCodigo}" y="88" width="${anchoCodigo}" height="118" rx="59" fill="${acento}" stroke="${TINTA}" stroke-width="4"/>
  <text x="${ANCHO - 56 - anchoCodigo / 2}" y="176" ${ROTULO} font-size="84" fill="${TINTA}" text-anchor="middle">${esc(codigo)}</text>` : ''}

  <!-- Marco de la foto (con letrero si no hay foto) -->
  ${o.imagen ? '' : sinFoto(o, 40, HISTORIA_FOTO_Y, ANCHO - 80, HISTORIA_FOTO_ALTO, 170)}
  <rect x="40" y="${HISTORIA_FOTO_Y}" width="${ANCHO - 80}" height="${HISTORIA_FOTO_ALTO}" fill="none" stroke="${TINTA}" stroke-width="6"/>
  ${Number(o.descuento) > 0 ? `<g transform="rotate(6 ${ANCHO - 190} ${HISTORIA_FOTO_Y + 84})">
    <rect x="${ANCHO - 310}" y="${HISTORIA_FOTO_Y + 30}" width="240" height="108" rx="6" fill="${TINTA}"/>
    <text x="${ANCHO - 190}" y="${HISTORIA_FOTO_Y + 112}" ${ROTULO} font-size="80" fill="${FOSFO}" text-anchor="middle">-${esc(o.descuento)}%</text>
  </g>` : ''}

  <!-- Título -->
  ${titulo.map((l, i) => `<text x="56" y="${y + 60 + i * 62}" ${TEXTO(700)} font-size="50" fill="${TINTA}">${esc(l)}</text>`).join('\n  ')}

  <!-- Precio a plumón en su cartulina -->
  <g transform="rotate(-2 ${48 + anchoEtiqueta / 2} ${yPrecio - 45})">
    <rect x="48" y="${yPrecio - 130}" width="${anchoEtiqueta}" height="170" fill="${acento}" stroke="${TINTA}" stroke-width="4"/>
    <text x="${48 + anchoEtiqueta / 2}" y="${yPrecio}" ${PLUMON} font-size="130" fill="${TINTA}" text-anchor="middle">${esc(precio)}</text>
  </g>
  ${tienePrevio ? `<text x="60" y="${yPrecio + 96}" ${TEXTO(600)} font-size="46" fill="${TINTA_2}">antes ${esc(pesos(o.precio_previo))}</text>
  <line x1="200" y1="${yPrecio + 90}" x2="${200 + anchoTexto(pesos(o.precio_previo), 46, 0.56) + 10}" y2="${yPrecio + 74}" stroke="${ROJO}" stroke-width="6" stroke-linecap="round"/>` : ''}
  ${fin ? `<text x="56" y="${yPrecio + (tienePrevio ? 160 : 96)}" ${ROTULO} font-size="54" fill="${ROJO}" letter-spacing="1">TERMINA ${esc(fin.toUpperCase())}</text>` : ''}

  <!-- Llamado: el link no se toca en una historia, así que se dice dónde está -->
  <rect x="56" y="1660" width="${ANCHO - 112}" height="120" rx="60" fill="${TINTA}"/>
  <text x="${ANCHO / 2}" y="1742" ${ROTULO} font-size="64" fill="${FOSFO}" text-anchor="middle" letter-spacing="2">${codigo ? `LINK EN MI PERFIL · ${esc(codigo)}` : 'LINK EN MI PERFIL'}</text>
  <text x="${ANCHO / 2}" y="1836" ${TEXTO(400)} font-size="30" fill="${TINTA_2}" text-anchor="middle">kalidapresio.albis-labs.xyz${corto} · enlace de afiliado</text>
</svg>`;
}
