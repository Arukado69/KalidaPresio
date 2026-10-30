# KalidaPresio

Ofertas calidad-precio de Mercado Libre México, elegidas a mano y publicadas
con **links oficiales de afiliado**. Astro estático, sin base de datos en el
frontend: los productos viven en [`src/data/vitrina.json`](src/data/vitrina.json),
cada cambio a ese archivo reconstruye el sitio y Caddy lo sirve detrás de Nginx
Proxy Manager.

El **Sello K-P** puntúa cada oferta de 0 a 100 combinando calificación real de
compradores (65 %), descuento real contra el precio anterior (20 %, con tope en
40 %) y volumen de ventas (15 %, en escala logarítmica de 100 a 100 mil
unidades).

> **Octubre 2026 — cambio de modelo.** El sitio armaba los links de afiliado a
> mano (`?matt_tool=…&matt_word=…_<canal><sección>`) y una compra real no
> generó comisión. Además, Mercado Libre bloquea a los servidores desde el 8 de
> octubre y el catálogo automático dejó de actualizarse. Ahora todo sale de la
> vitrina, con el link que tú generas en tu panel de afiliados, publicado tal
> cual. Guía completa: **[`docs/vitrina.md`](docs/vitrina.md)**.

---

## Puesta en marcha

```bash
npm install
cp .env.example .env      # SITE_URL es obligatoria para construir
npm run dev               # http://localhost:4321
```

## El día a día

| Qué | Dónde |
| :--- | :--- |
| Agregar o actualizar un producto | `/panel/agregar` (con el marcador del navegador) |
| Publicar en WhatsApp, Telegram, Facebook, Instagram, TikTok… | `/panel/hoy` |
| Tu «link en bio» numerado | `/hoy` (`/hoy?c=ig`, `/hoy?c=tt`) |
| Telegram automático | `n8n/telegram-tecnologia.json` |
| Saber si el sitio se quedó vacío o qué precios caducan | El issue `alarma-vitrina` (se abre y se cierra solo) |

## Comandos

| Comando | Qué hace |
| :--- | :--- |
| `npm run dev` | Servidor de desarrollo en `localhost:4321` |
| `npm run build` | Relámpago + feed.json + tarjetas + `astro build` → `dist/` |
| `npm test` | Tests de la lógica de negocio (Vitest) |
| `npm run revisar-vitrina` | ¿Está publicando el sitio? Lo mismo que la alarma diaria, en la consola |
| `npm run generar-feed` | Regenera `public/data/feed.json` (el que consume n8n) |
| `npm run generar-tarjetas` | Regenera las imágenes 4:5 y 9:16 de `public/promos/` |
| `npm run generar-og` | Regenera `public/og-default.png` (solo si cambia la identidad) |
| `npm run preview` | Sirve `dist/` localmente |

Herramientas del modelo anterior, solo para uso manual desde tu computadora
(Mercado Libre bloquea a los servidores): `npm run obtener-ofertas`,
`obtener-secciones`, `registrar-historico`, `detectar-nichos`,
`verificar-frescura`. Ninguna arma links de afiliado.

`SITE_URL` **no es opcional**: alimenta `rel="canonical"`, `og:url`, `og:image`
y el sitemap. El build de Docker falla a propósito si falta.

## Cómo fluyen los datos

```
/panel/agregar                 GitHub                      Build (CI y VPS)
──────────────                 ──────                      ────────────────
marcador en la ficha de ML     commit a                    generarRelampago.js → public/data/relampago.json
  + tu link oficial       ──►  src/data/vitrina.json  ──►  generarFeedPublico.js → public/data/feed.json (esquema 2)
  → vitrina.json completo      (deploy.yml)                generarTarjetasPromo.js → public/promos/<id>.jpg y -historia.jpg
                                                           astro build → dist/  (Caddy lo sirve)
```

**La regla que importa:** ningún enlace se construye ni se modifica. La
validación de [`src/utils/vitrina.js`](src/utils/vitrina.js) solo acepta los
links cortos del generador (`meli.la/…`, `mercadolibre.com/sec/…`); lo demás
se aparta con su motivo y el panel te dice qué arreglar. El CI falla si
aparece un `matt_tool=` en las páginas públicas.

Los datos derivados (`relampago.json`, `feed.json`, `public/promos/`) están en
`.gitignore` y se regeneran en cada build. `historico-precios.json` sí se
versiona: es observación acumulada, no un derivado.

## Estructura

```
src/
  components/   Tarjetas, sello K-P, carrusel relámpago, boletín…
  data/         vitrina.json (tus productos) · ofertas.js · secciones.js · colecciones.js
  layouts/      Layout.astro — head, SEO, footer y toda la orquestación de JS
  pages/        index, hoy, colecciones/[coleccion], ofertas/[seccion], panel/agregar,
                panel/hoy, sobre-mi, contacto, privacidad, 404, robots.txt
  scripts/      Build (relámpago, feed, tarjetas) y herramientas manuales
  utils/        Lógica pura y testeada: vitrina, publicacion, marcador, canales, score…
backend/        API Express + SQLite: contacto, boletín y los /r/ viejos
docker/         Caddyfile · analitica/ (Umami) · n8n/
docs/           vitrina.md · reparto.md · analitica.md · deploy.md
```

## Medición

Umami autoalojado, sin cookies y en el mismo VPS. Lo que se mide es el **clic
saliente** hacia Mercado Libre (`meli.la`, `mercadolibre.com/sec`,
`mercadolibre.com.mx`), con la **sección** de la que salió (`data-kp-seccion`)
y, en `/hoy`, el **canal** de quien llegó (`?c=ig`). Nada de eso toca el link.

Las **ventas** por canal las da el panel de afiliados de Mercado Libre, siempre
que generes un link por canal con su etiqueta (ver
[`docs/vitrina.md`](docs/vitrina.md#separar-las-ventas-por-red-etiquetas)).
Guía de Umami en **[`docs/analitica.md`](docs/analitica.md)**.

## Reparto

El sitio es una superficie; el resto se publica fuera: `/panel/hoy` arma cada
publicación en el formato de cada red, `/hoy` es el link de perfil para
Instagram y TikTok, y n8n publica en Telegram solo. Dónde conviene (y no
conviene) repartir, en **[`docs/reparto.md`](docs/reparto.md)**.

## Despliegue

VPS Hetzner + Docker + Nginx Proxy Manager. Todo en
**[`docs/deploy.md`](docs/deploy.md)**.

```bash
docker compose --env-file .env.production up -d --build
```

## Divulgación

KalidaPresio participa en el Programa de Afiliados de Mercado Libre México: si
compras a través de los enlaces podemos recibir una comisión sin costo adicional
para ti. Esa comisión **no altera** el orden: el Sello K-P se calcula solo con
señales objetivas. Los precios publicados son los del momento en que se
revisaron — la compra ocurre en Mercado Libre, a su precio. Ver
[`/sobre-mi`](src/pages/sobre-mi.astro) y [`/privacidad`](src/pages/privacidad.astro).
