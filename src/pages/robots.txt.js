/**
 * robots.txt generado en build-time.
 *
 * Se genera (en vez de vivir en public/) para que la URL del sitemap salga del
 * `site` de astro.config.mjs y no pueda quedarse desincronizada con el dominio
 * real. Un sitemap apuntando al dominio equivocado es peor que no tenerlo.
 */
export function GET({ site }) {
  const base = String(site ?? 'https://kalidapresio.albis-labs.xyz').replace(/\/$/, '');

  const cuerpo = `# KalidaPresio — ${base}
User-agent: *
Allow: /

# /recomienda/* son redirecciones de afiliado (302 a Mercado Libre): no hay
# contenido propio que indexar y los enlaces ya van con rel="nofollow sponsored".
Disallow: /recomienda/
Disallow: /api/

# /r/* son los enlaces cortos por canal (302 a Mercado Libre). Mismo caso.
Disallow: /r/

# /panel/* es la herramienta interna de reparto: no es contenido, y que salga
# en resultados solo confunde a quien la encuentre.
Disallow: /panel/

Sitemap: ${base}/sitemap-index.xml
`;

  return new Response(cuerpo, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
