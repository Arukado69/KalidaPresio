/**
 * generarTarjetasPromo.js — escribe las tarjetas de promoción a disco.
 *
 * Aquí viven SOLO los efectos: leer el feed, bajar la foto del producto,
 * componer con sharp y escribir el JPEG. Cómo se ve una tarjeta está en
 * `src/utils/tarjetas.js`, que se puede importar sin que ocurra nada — y por
 * eso se puede testear. Tenerlo todo junto tumbó la suite en CI una vez.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * Un post con la foto pelada del producto se ve igual que el de cientos de
 * cuentas que reenvían ofertas. Lo que distingue a KalidaPresio no es la
 * oferta: es el VEREDICTO sobre su precio, que nadie más puede dar porque
 * nadie más tiene el histórico.
 *
 * ── COSTO ──────────────────────────────────────────────────────────────────
 * Cero. `sharp` ya viene con Astro. Bannerbear o Placid cobran entre 20 y 50
 * USD al mes por lo mismo.
 *
 * ── DATO DERIVADO ──────────────────────────────────────────────────────────
 * Se regeneran en cada build desde feed.json, así que NO se versionan. Van a
 * public/promos/ y Caddy las sirve sin caché, que es como n8n las alcanza.
 *
 * Ejecutar:  npm run generar-tarjetas
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHO, FOTO_ALTO, BANDA_ALTO, ALTO, FONDO, svgFondo, svgTarjeta } from '../utils/tarjetas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEED = path.resolve(__dirname, '../../public/data/feed.json');
const SALIDA = path.resolve(__dirname, '../../public/promos');

/** Descarga la foto del producto. Devuelve null si no se puede: la tarjeta se hace igual. */
async function bajarFoto(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function main() {
  if (!existsSync(FEED)) {
    console.error('❌ [tarjetas] falta public/data/feed.json. Corre `npm run generar-feed` primero.');
    process.exit(1);
  }

  const crudo = JSON.parse(readFileSync(FEED, 'utf-8'));
  const items = Array.isArray(crudo) ? crudo : (crudo?.items ?? []);
  if (items.length === 0) {
    console.error('❌ [tarjetas] feed.json vacío. No se genera nada.');
    process.exit(1);
  }

  // Se borra y se rehace: son datos derivados, y una tarjeta huérfana de una
  // oferta que ya no existe es exactamente la clase de archivo viejo que este
  // proyecto ya pagó caro una vez.
  if (existsSync(SALIDA)) rmSync(SALIDA, { recursive: true, force: true });
  mkdirSync(SALIDA, { recursive: true });

  const { default: sharp } = await import('sharp');
  let hechas = 0;
  let sinFoto = 0;

  // Una por una, no en paralelo: el build corre en el VPS junto a los otros
  // contenedores, y 43 composiciones simultáneas son un pico de memoria
  // innecesario en una máquina de 4 GB.
  for (const o of items) {
    if (!o?.id) continue;
    const esMentira = o.historico?.nivel === 'descuento-falso';

    const capas = [{ input: Buffer.from(svgFondo()), top: 0, left: 0 }];
    const foto = o.imagen ? await bajarFoto(o.imagen) : null;
    if (foto) {
      try {
        const recortada = await sharp(foto)
          .resize(ANCHO, FOTO_ALTO, { fit: 'cover', position: 'centre' })
          .toBuffer();
        capas.push({ input: recortada, top: BANDA_ALTO, left: 0 });
      } catch {
        sinFoto++;
      }
    } else {
      sinFoto++;
    }

    capas.push({ input: Buffer.from(svgTarjeta(o, esMentira)), top: 0, left: 0 });

    const imagen = await sharp({
      create: { width: ANCHO, height: ALTO, channels: 4, background: FONDO },
    })
      .composite(capas)
      // JPEG y no PNG: la tarjeta es mayormente una foto, y ahí el PNG pesa
      // 1 MB contra 150 KB del JPEG a calidad 90 sin diferencia visible. Con
      // 43 tarjetas eso son 24 MB frente a 3.5 MB en cada despliegue, y son
      // imágenes que Telegram y cualquier red recomprimen de todos modos.
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    writeFileSync(path.resolve(SALIDA, `${o.id}.jpg`), imagen);
    hechas++;
  }

  const mentiras = items.filter((o) => o.historico?.nivel === 'descuento-falso').length;
  console.log(`🖼️  [tarjetas] ${hechas} generadas en public/promos/ (${mentiras} de descuento falso).`);
  if (sinFoto) console.log(`   ${sinFoto} sin foto del producto: la tarjeta se hizo igual, solo con el marco.`);
}

main().catch((err) => {
  console.error(`\n✗ [tarjetas] ${err.message}\n`);
  process.exit(1);
});
