// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// URL pública del sitio. NO es cosmética: alimenta rel="canonical", las URLs
// absolutas de Open Graph y el sitemap. Sin ella, Astro resuelve Astro.url
// contra el servidor de desarrollo y CADA página de producción sale declarando
// su canónica en http://localhost:4321 (Google las descarta).
// Se puede sobrescribir con SITE_URL para despliegues en un dominio distinto.
const SITE = process.env.SITE_URL || 'https://kalidapresio.albis-labs.xyz';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  trailingSlash: 'ignore',
  // Ya no hay integración que raspe Mercado Libre al inicio del build: desde
  // octubre de 2026 ML bloquea a los servidores y el sitio sale de la vitrina
  // (src/data/vitrina.json), que no necesita red para construirse.
  integrations: [
    sitemap({
      // El sitemap es una invitación a rastrear: solo entra lo que queremos
      // indexado. /api/* no existe como página estática, pero el filtro deja
      // constancia de la intención. /panel/* sí existe y es herramienta
      // interna de reparto: no es contenido y no debe invitarse a rastrearla.
      filter: (page) => !page.includes('/api/') && !page.includes('/panel/'),
      i18n: undefined,
    }),
  ],
});
