FROM node:22.12.0-alpine

WORKDIR /app

# Dependencias con lockfile (build reproducible)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Código del backend
COPY . .

# Directorio de datos (volumen para la SQLite persistente)
RUN mkdir -p /data
ENV DB_PATH=/data/database.sqlite

EXPOSE 3001

# node:sqlite es experimental en Node 22.x → REQUIERE el flag, si no truena
# al arrancar con "No such built-in module: node:sqlite".
CMD ["node", "--experimental-sqlite", "server.js"]
