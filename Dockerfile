# ============================================================================
# KalidaPresio — Frontend (Astro SSG) servido por Caddy con HTTPS automático.
# Multi-stage: (1) Node compila el sitio estático  →  (2) Caddy lo sirve.
# ============================================================================

# ── Etapa 1: build del sitio estático ──────────────────────────────────────
FROM node:22.12.0-alpine AS build
WORKDIR /app

# Instala dependencias con lockfile (build reproducible)
COPY package.json package-lock.json ./
RUN npm ci

# Copia el código y compila.
# `npm run build` = genera _redirects + relampago.json (endsAt +24h) + astro build.
# El hook de astro.config re-escanea secciones desde ML; si ML no responde,
# degrada al JSON existente y el build NO falla.
COPY . .
RUN npm run build

# ── Etapa 2: servidor Caddy (HTTPS automático vía Let's Encrypt) ────────────
FROM caddy:2-alpine
# El sitio estático compilado
COPY --from=build /app/dist /srv
# Config del reverse proxy + cache + auto-TLS
COPY docker/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
# La imagen base de Caddy ya trae el ENTRYPOINT/CMD correcto.
