/**
 * robots.txt generado en build-time.
 *
 * Se genera (en vez de vivir en public/) para que la URL del sitemap salga del
 * `site` de astro.config.mjs y no pueda quedarse desincronizada con el dominio
 * real. Un sitemap apuntando al dominio equivocado es peor que no tenerlo.
 */
export function GET({ site }) {
  const base = String(site ?? 'https://kalidapresio.com').replace(/\/$/, '');

  const cuerpo = `# KalidaPresio — https://kalidapresio.com
User-agent: *
Allow: /

# /recomienda/* son redirecciones de afiliado (302 a Mercado Libre): no hay
# contenido propio que indexar y los enlaces ya van con rel="nofollow sponsored".
Disallow: /recomienda/
Disallow: /api/

Sitemap: ${base}/sitemap-index.xml
`;

  return new Response(cuerpo, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
