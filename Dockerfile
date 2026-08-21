# syntax=docker/dockerfile:1
# =============================================================================
# KalidaPresio — Frontend (Astro SSG) servido por Caddy en HTTP interno.
#
# Detrás de Nginx Proxy Manager: este contenedor NO pide certificados ni toca
# los puertos 80/443 del host (de esos ya es dueño NPM). Escucha en :80 dentro
# de la red de Docker y NPM le hace proxy por nombre → kalidapresio-web:80.
#
# LO QUE SE HORNEA EN EL BUILD (y por eso llega como build arg):
#   · SITE_URL         → rel="canonical", og:url, og:image y el sitemap. Si
#                        falta, TODAS las páginas salen apuntando a localhost.
#   · ML_MATT_TOOL/WORD→ los parámetros de afiliado de cada enlace y de los
#                        redirects /recomienda/*. Es el camino del dinero.
#   · PUBLIC_RELAMPAGO_URL, IS_HOT_SALE → se incrustan en el bundle.
# Los secretos de runtime (RESEND_API_KEY, SUBSCRIBE_SECRET, EXPORT_TOKEN…) NO
# se hornean: viven en el servicio `api` vía env_file.
# =============================================================================

# ── Etapa 1: dependencias (capa cacheable, solo se rehace si cambia el lock) ─
FROM node:22.12.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Etapa 2: build del sitio estático ───────────────────────────────────────
FROM node:22.12.0-alpine AS build
WORKDIR /app

ARG SITE_URL
ARG ML_MATT_TOOL
ARG ML_MATT_WORD
ARG PUBLIC_RELAMPAGO_URL=/data/relampago.json
ARG IS_HOT_SALE=false
ARG SKIP_EXTRACCION=false
# Analítica: si alguna falta, el componente no emite ni una etiqueta.
ARG PUBLIC_UMAMI_URL
ARG PUBLIC_UMAMI_ID
ARG PUBLIC_UMAMI_SCRIPT=kp.js
ENV SITE_URL=$SITE_URL \
    ML_MATT_TOOL=$ML_MATT_TOOL \
    ML_MATT_WORD=$ML_MATT_WORD \
    PUBLIC_RELAMPAGO_URL=$PUBLIC_RELAMPAGO_URL \
    IS_HOT_SALE=$IS_HOT_SALE \
    SKIP_EXTRACCION=$SKIP_EXTRACCION \
    PUBLIC_UMAMI_URL=$PUBLIC_UMAMI_URL \
    PUBLIC_UMAMI_ID=$PUBLIC_UMAMI_ID \
    PUBLIC_UMAMI_SCRIPT=$PUBLIC_UMAMI_SCRIPT \
    ASTRO_TELEMETRY_DISABLED=1

# Falla TEMPRANO y con mensaje claro si falta SITE_URL, en vez de publicar un
# sitio entero cuyas canónicas apuntan a http://localhost:4321 (Google las
# descarta y el sitio desaparece del índice sin que nada dé error).
RUN test -n "$SITE_URL" || \
    (echo "❌ Falta build-arg SITE_URL. Usa: docker compose --env-file .env.production up -d --build" && exit 1)

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `npm run build` = redirects (_redirects + docker/redirects.caddy)
#                 + relampago.json (endsAt +24 h)
#                 + astro build (el hook re-escanea secciones desde ML).
# Si ML no responde, secciones.js descarta el feed por edad y degrada a
# ofertas.json: el build NO falla y los precios siguen siendo los del bot de 3 h.
RUN npm run build

# ── Etapa 3: servidor Caddy ─────────────────────────────────────────────────
FROM caddy:2-alpine
# El sitio estático compilado
COPY --from=build /app/dist /srv
# Config del reverse proxy + cabeceras de seguridad + página 404 real
COPY docker/Caddyfile /etc/caddy/Caddyfile
# Redirects de afiliado generados en el build (/recomienda/<id> → ML con tu código)
COPY --from=build /app/docker/redirects.caddy /etc/caddy/redirects.caddy

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
# La imagen base de Caddy ya trae el ENTRYPOINT/CMD correcto.
