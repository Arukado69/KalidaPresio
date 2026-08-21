# KalidaPresio

Sitio de ofertas calidad-precio de Mercado Libre México. Astro estático, sin
base de datos en el frontend: un bot refresca el catálogo cada 3 horas, el sitio
se reconstruye y Caddy lo sirve detrás de Nginx Proxy Manager.

El **Sello K-P** puntúa cada oferta de 0 a 100 combinando calificación real de
compradores (65 %), descuento real verificado contra el precio previo (20 %, con
tope en 40 %) y volumen de opiniones (15 %, saturado en 500). Las secciones de
precio permanente bajo («Imbatibles») usan un recalibrado 65/10/25 porque ahí ML
no manda `previous_price` y penalizar la falta de descuento sería injusto.

---

## Puesta en marcha

```bash
npm install
cp .env.example .env      # SITE_URL es obligatoria para construir
npm run dev               # http://localhost:4321
```

## Comandos

| Comando | Qué hace |
| :--- | :--- |
| `npm run dev` | Servidor de desarrollo en `localhost:4321` |
| `npm run build` | Redirects de afiliado + relámpago + `astro build` → `dist/` |
| `npm run build:completo` | Re-escanea ofertas desde ML y luego construye |
| `npm test` | Tests de la lógica de negocio (Vitest) |
| `npm run obtener-ofertas` | Refresca `src/data/ofertas.json` desde ML |
| `npm run obtener-secciones` | Refresca `src/data/secciones-feed.json` (por sección) |
| `npm run enriquecer-curados` | Rellena título e imagen de `curados.json` vía API de catálogo |
| `npm run generar-og` | Regenera `public/og-default.png` (solo si cambia la identidad) |
| `npm run preview` | Sirve `dist/` localmente |

`SITE_URL` **no es opcional**: alimenta `rel="canonical"`, `og:url`, `og:image`
y el sitemap. El build de Docker falla a propósito si falta, porque sin ella el
sitio se publica declarando sus canónicas en `localhost` y Google lo descarta.

## Cómo fluyen los datos

```
GitHub Action (cada 3 h)              Build                         Producción
────────────────────────              ─────                         ──────────
importarOfertas.js                    generadorRedirects.js         Caddy
  scrape /ofertas de ML                 → docker/redirects.caddy      /recomienda/* → ML
  score K-P + filtros                   → public/_redirects           /api/*        → Express
  → src/data/ofertas.json  ──┐        generarRelampago.js             resto         → dist/
     (commit + push)         │          → public/data/relampago.json
                             │        astro build
                             └──────►   hook: extraer-secciones.mjs
                                          → src/data/secciones-feed.json (sellado)
                                        secciones.js
                                          TTL 12 h; si está viejo o falta,
                                          degrada a ofertas.json
```

**La regla que importa:** ningún dato derivado se versiona.
`secciones-feed.json`, `_redirects`, `redirects.caddy` y `relampago.json` están
en `.gitignore` y se regeneran en cada build. Versionarlos fue lo que dejó la
portada dos meses sirviendo precios de junio: el extractor dejó de funcionar y
el JSON viejo siguió en el repo, listo para desplegarse, sin que nada avisara.

## Estructura

```
src/
  components/   Tarjetas, sello K-P, carrusel relámpago, boletín…
  data/         ofertas.json (versionado) · colecciones.js · secciones.js
  layouts/      Layout.astro — head, SEO, footer y toda la orquestación de JS
  pages/        index, colecciones/[coleccion], blog, sobre-mi, contacto,
                privacidad, 404, robots.txt
  scripts/      Pipeline de datos (build-time y manual)
  utils/        Lógica pura y testeada: score, afiliado, categorías, veredicto
backend/        API Express + SQLite: contacto y boletín con doble opt-in
docker/         Caddyfile (+ redirects.caddy generado) · analitica/ (stack de Umami)
docs/           deploy.md · analitica.md
```

## Medición

Umami autoalojado, sin cookies y en el mismo VPS. Lo que se mide de verdad es el
**clic saliente** hacia Mercado Libre, etiquetado con la sección de la que
salió — y esa etiqueta es el mismo sufijo de `matt_word` que registra el panel
de afiliados de ML, así que las dos mitades del embudo se cruzan.
Guía completa en **[`docs/analitica.md`](docs/analitica.md)**.

Sin `PUBLIC_UMAMI_URL` y `PUBLIC_UMAMI_ID` el sitio no emite ni una etiqueta de
rastreo.

## Despliegue

VPS Hetzner + Docker + Nginx Proxy Manager. Todo en
**[`docs/deploy.md`](docs/deploy.md)**.

```bash
docker compose --env-file .env.production up -d --build
```

## Divulgación

KalidaPresio participa en el Programa de Afiliados de Mercado Libre México: si
compras a través de los enlaces podemos recibir una comisión sin costo adicional
para ti. Esa comisión **no altera** el orden ni la selección: el Sello K-P se
calcula solo con señales objetivas del feed. Los precios publicados son una foto
del momento en que se detectaron — la compra ocurre en Mercado Libre, a su
precio. Ver [`/sobre-mi`](src/pages/sobre-mi.astro) y
[`/privacidad`](src/pages/privacidad.astro).
