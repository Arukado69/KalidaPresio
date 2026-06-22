# Despliegue KalidaPresio v1.2 — Hetzner + Porkbun (vía Bash/SSH)

Arquitectura en producción:

```
            Porkbun DNS (A record) ──► IP del VPS Hetzner
                                          │
                                     Nginx (443/80, TLS)
                          ┌───────────────┴───────────────┐
                  sirve  dist/  (sitio Astro)      proxy /api/* ──► :3001
                  (estático)                        (backend Express + SQLite)
                          │
                  /data/relampago.json  ◄── cron lo regenera cada 12 h (sin rebuild)
```

Decisión de arquitectura de formularios: en este modelo manda el **backend Express**
(`backend/`). La carpeta `functions/` (Cloudflare Pages Functions) **no se usa** aquí
— puedes ignorarla o borrarla. Diferencia: el Express guarda en SQLite (opt-in simple,
sin correo de confirmación); las Functions hacían doble opt-in con envío de correo.

---

## 0. Requisitos en el VPS (una sola vez)
```bash
sudo apt update && sudo apt install -y nginx
# Node 22.12+ (para los scripts de build) — vía nvm o nodesource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo apt install -y certbot python3-certbot-nginx
# Docker (para el backend) — opcional si corres el backend con node directo
curl -fsSL https://get.docker.com | sudo sh
```

## 1. Build del sitio (en tu máquina o en el VPS)
```bash
cd kalidapresio2.0
npm ci
npm run build        # genera redirects + relampago.json fresco + dist/
```
El build deja todo en `dist/`. Si lo construyes local, súbelo al VPS:
```bash
rsync -avz --delete dist/ usuario@IP_HETZNER:/var/www/kalidapresio/
```

## 2. Backend Express (formularios) en el VPS
```bash
cd backend
# Opción A — Docker (hay Dockerfile):
docker build -t kalida-backend .
docker run -d --name kalida-backend --restart unless-stopped \
  -p 127.0.0.1:3001:3001 \
  -v /var/data/kalida:/app/data \
  kalida-backend
# Opción B — Node directo con PM2:
npm install && pm2 start "node server.js" --name kalida-backend
```
⚠️ **Gotcha node:sqlite**: `db.js` usa `node:sqlite`, que en Node 22.x es experimental
y requiere el flag `--experimental-sqlite`. Si el contenedor falla al arrancar con
"No such built-in module: node:sqlite", cambia el arranque a
`node --experimental-sqlite server.js` (en el `CMD` del Dockerfile o en el script
`start`), o usa Node 24+. La DB SQLite debe vivir en un volumen persistente para no
perder suscriptores al recrear el contenedor.

## 3. Nginx — sitio estático + proxy del API + caché del JSON
`/etc/nginx/sites-available/kalidapresio`:
```nginx
server {
  server_name kalidapresio.com www.kalidapresio.com;
  root /var/www/kalidapresio;
  index index.html;

  # SPA-ish: Astro genera /ruta/index.html
  location / { try_files $uri $uri/ $uri.html /index.html; }

  # CLAVE para "ofertas en vivo": el JSON de relámpago NO se cachea,
  # así el cron lo actualiza y el navegador siempre lee la última versión.
  location = /data/relampago.json {
    add_header Cache-Control "no-cache, must-revalidate";
    expires off;
  }

  # Assets con hash → caché agresiva
  location /_astro/ { expires 1y; add_header Cache-Control "public, immutable"; }

  # Formularios → backend Express
  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/kalidapresio /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 4. Dominio (Porkbun) + TLS
- En Porkbun: crea un **A record** `@` y `www` → IP del VPS Hetzner.
- Espera propagación DNS, luego:
```bash
sudo certbot --nginx -d kalidapresio.com -d www.kalidapresio.com
```

## 5. Ofertas relámpago "en vivo" — cron de refresco (sin rebuild)
Regenera `relampago.json` directo en el web root cada 12 h. El sitio lo relee solo
(mi `initRelampagoFetch` hace fetch en runtime). NO reconstruye Astro.
```bash
crontab -e
```
```cron
# Cada 12 h: relámpago fresco (endsAt +24h) en el web root
0 */12 * * * cd /ruta/kalidapresio2.0 && /usr/bin/node src/scripts/generarRelampago.js && cp public/data/relampago.json /var/www/kalidapresio/data/relampago.json
```
Para rotar también los PRODUCTOS (no solo las fechas), añade antes
`node src/scripts/importarOfertas.js` (requiere las credenciales ML OAuth en el `.env`
del servidor) — p. ej. una vez al día.

## 6. Variables de entorno en el VPS
`backend/.env` (o variables del contenedor):
```
PORT=3001
EXPORT_TOKEN=<token-largo-y-secreto>   # protege /api/export/subscribers
```
El sitio estático no necesita secretos. `PUBLIC_RELAMPAGO_URL` queda en su default
`/data/relampago.json` (mismo dominio). Si algún día sirves el JSON desde otro host,
cámbiala antes del build.

## 7. Checklist final antes de anunciar
- [ ] `https://kalidapresio.com` carga con TLS válido.
- [ ] Sección relámpago muestra 8 ofertas (no vacía).
- [ ] Enviar el formulario de contacto → 200 y aparece en SQLite.
- [ ] Suscribir un correo → 200; duplicado → 200 (no filtra).
- [ ] Esperar a que el cron corra (o ejecútalo a mano) y verificar que `endsAt`
      avanza y el carrusel sigue lleno tras 24 h.
