// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Integración KalidaPresio: al INICIO de cada build corre el extractor de
 * secciones (src/scripts/extraer-secciones.mjs) para que relámpago llegue
 * fresco (las lightning rotan cada pocas horas) e imbatibles del día.
 *
 *  · Silencioso: el detalle del sondeo no ensucia el log del build.
 *  · NUNCA truena el build: si ML no responde, src/data/secciones.js descarta
 *    el JSON viejo por edad (TTL de 12 h) y degrada a ofertas.json.
 *  · Solo en `astro build` (no en dev) y saltable con SKIP_EXTRACCION=true
 *    (útil para builds locales repetidos sin golpear a ML).
 *  · El flujo de ofertas.json (n8n / GitHub Action) NO se toca: ambos
 *    pipelines corren en paralelo hasta que n8n los fusione.
 */
function extractorSecciones() {
  return {
    name: 'kalidapresio:extraer-secciones',
    hooks: {
      'astro:build:start': async ({ logger }) => {
        if (process.env.SKIP_EXTRACCION === 'true') {
          logger.info('Extractor de secciones omitido (SKIP_EXTRACCION=true).');
          return;
        }
        logger.info('Refrescando secciones (relámpago/imbatibles) desde ML…');
        try {
          await new Promise((resolve, reject) => {
            const hijo = spawn(
              process.execPath,
              [fileURLToPath(new URL('./src/scripts/extraer-secciones.mjs', import.meta.url))],
              { stdio: 'ignore', timeout: 120_000 },
            );
            hijo.on('exit', (code) => (code === 0 ? resolve(undefined) : reject(new Error(`código de salida ${code}`))));
            hijo.on('error', reject);
          });
          logger.info('secciones-feed.json refrescado ✓');
        } catch (e) {
          logger.warn(`Extractor falló (${e.message}). Se degrada a ofertas.json (feed del bot de 3 h).`);
        }
      },
    },
  };
}

// URL pública del sitio. NO es cosmética: alimenta rel="canonical", las URLs
// absolutas de Open Graph y el sitemap. Sin ella, Astro resuelve Astro.url
// contra el servidor de desarrollo y CADA página de producción sale declarando
// su canónica en http://localhost:4321 (Google las descarta).
// Se puede sobrescribir con SITE_URL para despliegues en un dominio distinto.
const SITE = process.env.SITE_URL || 'https://kalidapresio.com';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  trailingSlash: 'ignore',
  integrations: [
    extractorSecciones(),
    sitemap({
      // El sitemap es una invitación a rastrear: solo entra lo que queremos
      // indexado. /api/* no existe como página estática, pero el filtro deja
      // constancia de la intención.
      filter: (page) => !page.includes('/api/'),
      i18n: undefined,
    }),
  ],
});
