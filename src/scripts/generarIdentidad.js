/**
 * generarIdentidad.js — Los íconos de KalidaPresio y la imagen para compartir.
 *
 * Escribe, con la «K» de la marca (src/utils/identidad.js):
 *   · public/favicon.svg, public/favicon.ico   → la pestaña del navegador
 *   · public/apple-touch-icon.png (180)        → acceso directo en iPhone
 *   · public/iconos/kp-192.png, kp-512.png     → la app del panel en Android
 *   · public/iconos/kp-maskable-512.png        → la misma, recortable en círculo
 *   · public/og-default.png (1200×630)         → la vista previa al compartir
 *
 * POR QUÉ EXISTE: el favicon seguía siendo el logo de Astro (el que trae la
 * plantilla) y la imagen para compartir era la del diseño violeta anterior.
 * Y para que el panel se instale como app en Android (y aparezca en el menú
 * «Compartir» de la app de Mercado Libre) Chrome exige íconos PNG de 192 y 512.
 *
 * NO forma parte del build: son archivos estables, se generan una vez y se
 * versionan. Regenerar solo si cambia la identidad visual:
 *     npm run generar-identidad
 *
 * Usa `sharp`, que ya viene con Astro.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { svgMarcaK, svgOg, icoDePngs } from '../utils/identidad.js';
import { confFuentes } from '../utils/tarjetas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.resolve(__dirname, '../../public');
const ICONOS = path.join(PUBLICO, 'iconos');
const FUENTES = path.resolve(__dirname, '../assets/fuentes');

// Las fuentes de la marca para el texto de og-default.png. Tiene que pasar
// ANTES de cargar sharp (ver generarTarjetasPromo.js).
const dirFuentes = path.join(os.tmpdir(), 'kalidapresio-fuentes');
mkdirSync(path.join(dirFuentes, 'cache'), { recursive: true });
const conf = path.join(dirFuentes, 'fonts.conf');
writeFileSync(conf, confFuentes(FUENTES, path.join(dirFuentes, 'cache')));
process.env.FONTCONFIG_FILE = conf;

const { default: sharp } = await import('sharp');
mkdirSync(ICONOS, { recursive: true });

/** El SVG de la K, pasado a PNG del tamaño pedido. */
const png = (tamano, opciones) =>
  sharp(Buffer.from(svgMarcaK(tamano, opciones))).png({ compressionLevel: 9 }).toBuffer();

const escrito = [];
const escribir = (ruta, datos) => {
  writeFileSync(ruta, datos);
  escrito.push(`${path.relative(PUBLICO, ruta)} (${(datos.length / 1024).toFixed(1)} KB)`);
};

escribir(path.join(PUBLICO, 'favicon.svg'), `${svgMarcaK(128)}\n`);
escribir(
  path.join(PUBLICO, 'favicon.ico'),
  icoDePngs([
    { tamano: 16, png: await png(16) },
    { tamano: 32, png: await png(32) },
    { tamano: 48, png: await png(48) },
  ]),
);
// iOS pone sus propias esquinas redondas y no admite transparencia: va a sangre.
escribir(path.join(PUBLICO, 'apple-touch-icon.png'), await png(180, { maskable: true }));
escribir(path.join(ICONOS, 'kp-192.png'), await png(192));
escribir(path.join(ICONOS, 'kp-512.png'), await png(512));
escribir(path.join(ICONOS, 'kp-maskable-512.png'), await png(512, { maskable: true }));
escribir(
  path.join(PUBLICO, 'og-default.png'),
  await sharp(Buffer.from(svgOg())).png({ compressionLevel: 9 }).toBuffer(),
);

console.log(`✅ [identidad] Listo:\n   · ${escrito.join('\n   · ')}`);
console.log('   Versiónalos: el sitio y el panel los usan tal cual.');
