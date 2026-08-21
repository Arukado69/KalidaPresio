# =============================================================================
# KalidaPresio — API (Express + SQLite): contacto y boletín con doble opt-in.
# Escucha SOLO en la red interna de Docker; Caddy le hace proxy en /api/*.
# =============================================================================
FROM node:22.12.0-alpine

WORKDIR /app

# Dependencias con lockfile (build reproducible)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Código del backend
COPY . .

# Directorio de datos (volumen para la SQLite persistente)
RUN mkdir -p /data && chown -R node:node /data /app
ENV DB_PATH=/data/database.sqlite \
    NODE_ENV=production

# Sin privilegios: el proceso no necesita root para nada.
USER node

EXPOSE 3001

# node:sqlite es experimental en Node 22.x → REQUIERE el flag, si no truena
# al arrancar con "No such built-in module: node:sqlite".
CMD ["node", "--experimental-sqlite", "server.js"]
