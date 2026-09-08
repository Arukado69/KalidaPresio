/**
 * observarPrecios — la pasada PROFUNDA, solo para el histórico.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * El feed del sitio lee la página 1 y se queda con ~40 ofertas que superan el
 * filtro de calidad. Eso ataba lo que SEGUIMOS a lo que MOSTRAMOS: un producto
 * dejaba de existir para nosotros en cuanto ML lo quitaba de destacados, y la
 * profundidad mediana del histórico se quedó en UN día.
 *
 * Esta pasada lee p1–p5 y NO filtra por calidad: al histórico le sirve
 * cualquier precio observado. Medido el 8-sep-2026, eso refresca ~137
 * productos ya seguidos en vez de ~40.
 *
 * ── LO QUE NO HACE ─────────────────────────────────────────────────────────
 * No toca ofertas.json. El feed del sitio sigue siendo la página 1 y sigue
 * decidiendo qué se muestra. Si esta pasada falla, la portada no se entera.
 *
 * Ejecutar:  npm run observar-precios
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descargarPagina, extraerAppProps } from '../utils/scrapeOfertas.js';
import { leerTarjeta } from '../utils/mlPayload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.resolve(__dirname, '../data/observaciones.json');

const PAGINAS = Number(process.env.PAGINAS_OBSERVACION) || 5;
/** Por debajo de esto algo se rompió: p1–p5 dieron 489 ids el 8-sep-2026. */
const MINIMO_ESPERADO = Number(process.env.MINIMO_OBSERVACIONES) || 150;
/** Pausa entre páginas: esto tiene que parecer alguien navegando. */
const PAUSA_MS = 1500;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`👁️  Observando precios en ${PAGINAS} páginas de ofertas…`);

  /** @type {Record<string, number>} */
  const precios = {};
  let paginasOk = 0;

  for (let p = 1; p <= PAGINAS; p++) {
    try {
      const items = extraerAppProps(await descargarPagina(p));
      let nuevos = 0;
      for (const item of items) {
        // Sin función de afiliado: aquí solo interesa el precio, no el enlace.
        const t = leerTarjeta(item);
        if (!t?.id || !Number.isFinite(t.precio_actual) || t.precio_actual <= 0) continue;
        // Si el mismo id sale en dos páginas, nos quedamos con el menor: la
        // entrada del día guarda min/max y el mínimo es el dato que importa.
        precios[t.id] = Math.min(precios[t.id] ?? Infinity, t.precio_actual);
        nuevos++;
      }
      paginasOk++;
      console.log(`   p${p}: ${nuevos} precios`);
    } catch (e) {
      // Una página menos es menos cobertura, no un dato corrupto. Se sigue.
      console.warn(`   ⚠️  p${p} falló: ${e.message}`);
    }
    if (p < PAGINAS) await espera(PAUSA_MS);
  }

  const total = Object.keys(precios).length;
  const sobre = { generadoEl: new Date().toISOString(), paginas: paginasOk, total, precios };
  await writeFile(SALIDA, JSON.stringify(sobre, null, 2), 'utf-8');
  console.log(`💾  observaciones.json: ${total} precios de ${paginasOk}/${PAGINAS} páginas.`);

  // La sonda. Fallar en silencio es lo que dejó el scraper 43 días muerto.
  if (total < MINIMO_ESPERADO) {
    console.error(`❌ Solo ${total} observaciones, esperadas ≥ ${MINIMO_ESPERADO}. ¿Cambió el HTML de ML?`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n✗ [observarPrecios] ${err.message}\n`);
  process.exit(1);
});
