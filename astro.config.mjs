// @ts-check
import { defineConfig } from 'astro/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Integración KalidaPresio: al INICIO de cada build corre el extractor de
 * secciones (src/scripts/extraer-secciones.mjs) para que relámpago llegue
 * fresco (las lightning rotan cada pocas horas) e imbatibles del día.
 *
 *  · Silencioso: el detalle del sondeo no ensucia el log del build.
 *  · NUNCA truena el build: si ML no responde, se usa el JSON existente y,
 *    si tampoco hay, src/data/secciones.js degrada a ofertas.json.
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
          logger.info('secciones-prueba.json refrescado ✓');
        } catch (e) {
          logger.warn(`Extractor falló (${e.message}). Se usa el JSON previo o el fallback a ofertas.json.`);
        }
      },
    },
  };
}

// https://astro.build/config
export default defineConfig({
  integrations: [extractorSecciones()],
});
