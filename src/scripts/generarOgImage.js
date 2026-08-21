/**
 * generarOgImage.js — Genera public/og-default.png (1200×630).
 *
 * POR QUÉ EXISTE: el Layout declaraba `ogImage = '/og-default.jpg'` y ese
 * archivo nunca existió, así que al compartir el sitio en WhatsApp, Facebook o
 * X la vista previa salía sin imagen. Los scrapers además exigen una URL
 * absoluta y un formato raster (SVG no lo pintan).
 *
 * NO forma parte del build: la imagen es estable, se genera una vez y se
 * versiona. Regenerar solo si cambia la identidad visual:
 *     npm run generar-og
 *
 * Usa `sharp`, que ya viene con Astro (servicio de imágenes).
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../../public');
const OUTPUT = path.resolve(OUTPUT_DIR, 'og-default.png');

// Paleta de marca (misma que global.css: violeta profundo + verde K-P).
const FONDO = '#140e1f';
const VIOLETA = '#280455';
const VERDE = '#1fd28e';
const TEXTO = '#f0eef8';
const TENUE = '#a59cc4';

// Sin dependencias tipográficas: sharp renderiza el SVG con las fuentes del
// sistema, y en un contenedor puede no haber ninguna. Por eso el texto se
// declara con familias genéricas y tamaños grandes: legible en cualquier caso.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${FONDO}"/>
      <stop offset="100%" stop-color="${VIOLETA}"/>
    </linearGradient>
    <linearGradient id="acento" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${VERDE}"/>
      <stop offset="100%" stop-color="#2ee3a0"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#fondo)"/>

  <!-- Halo verde en la esquina, como el glow de los CTA del sitio -->
  <circle cx="1080" cy="120" r="260" fill="${VERDE}" opacity="0.10"/>
  <circle cx="1150" cy="560" r="180" fill="${VERDE}" opacity="0.06"/>

  <!-- Barra de acento a la izquierda -->
  <rect x="90" y="196" width="6" height="238" rx="3" fill="url(#acento)"/>

  <g font-family="Segoe UI, Helvetica, Arial, sans-serif">
    <text x="128" y="238" fill="${VERDE}" font-size="30" font-weight="700" letter-spacing="6">KALIDAPRESIO</text>
    <text x="128" y="330" fill="${TEXTO}" font-size="72" font-weight="800">Ofertas que sí valen</text>
    <text x="128" y="410" fill="${TEXTO}" font-size="72" font-weight="800">la pena</text>
    <text x="128" y="472" fill="${TENUE}" font-size="27" font-weight="400">Calidad real, descuento real. Mercado Libre México.</text>
  </g>

  <!-- Sello K-P: el mismo lenguaje visual que las tarjetas -->
  <g transform="translate(950, 300)">
    <circle cx="0" cy="0" r="88" fill="none" stroke="${VERDE}" stroke-width="4" opacity="0.55"/>
    <text x="0" y="4" text-anchor="middle" fill="${VERDE}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="52" font-weight="800">K-P</text>
    <text x="0" y="46" text-anchor="middle" fill="${TENUE}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="19" font-weight="600" letter-spacing="2">SELLO</text>
  </g>
</svg>`;

const { default: sharp } = await import('sharp');

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(OUTPUT, png);

console.log(`✅ [OG] public/og-default.png generado (${(png.length / 1024).toFixed(1)} KB, 1200×630).`);
console.log('   Versiónalo: el Layout lo referencia como imagen por defecto de Open Graph.');
