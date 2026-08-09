# Despliegue KalidaPresio — Hetzner + Porkbun (Docker + GitHub Actions)

Todo va en contenedores, versionado en el repo. Un `git push` a `main` despliega solo.

```
        Porkbun DNS (A record @ y www) ──► IP del VPS Hetzner
                                              │  (puertos 80 + 443)
                                    ┌─────────┴──────────┐
                                    │   contenedor       │
                                    │   frontend (Caddy) │  HTTPS automático
                                    │   sirve dist/      │  (Let's Encrypt)
                                    └─────────┬──────────┘
                             /api/*  │        │  todo lo demás
                                     ▼        ▼
                             ┌──────────────┐  sitio Astro estático
                             │ backend      │  (bento, curados, colecciones…)
                             │ Express+SQLite│
                             └──────────────┘
```

- **frontend** (`Dockerfile` raíz): compila Astro y lo sirve con **Caddy**, que
  además obtiene el certificado HTTPS solo y hace de reverse-proxy de `/api`.
- **backend** (`backend/Dockerfile`): Express + SQLite (contacto y boletín).
- **`functions/`** (Cloudflare Pages Functions) NO se usa en este modelo. Ignórala.

---

## 1. Requisitos en el VPS (una sola vez)
Solo Docker. Caddy maneja TLS, así que **no** necesitas nginx ni certbot.
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # re-loguéate después
```

## 2. Primer despliegue (manual, una vez)
```bash
sudo mkdir -p /var/www/kalidapresio && sudo chown $USER /var/www/kalidapresio
git clone https://github.com/Arukado69/KalidaPresio.git /var/www/kalidapresio
cd /var/www/kalidapresio

# Configura las variables de producción
cp .env.example .env
nano .env      # pon SITE_ADDRESS=kalidapresio.com y un EXPORT_TOKEN seguro

# Levanta todo (Caddy pedirá el certificado automáticamente)
docker compose up -d --build
docker compose ps          # ambos servicios 'running'/'healthy'
```

## 3. Dominio (Porkbun) + HTTPS
- En Porkbun: **A record** `@` y `www` → IP del VPS.
- Con el DNS propagado y `SITE_ADDRESS=kalidapresio.com`, Caddy obtiene el
  certificado Let's Encrypt **automáticamente** al arrancar. Sin certbot, sin cron.
- Verifica: `https://kalidapresio.com` con candado válido.

## 4. Despliegue continuo (ya configurado: `deploy.yml`)
Cada push a `main` (incluye los commits de datos del bot cada 3 h) dispara el
workflow, que hace SSH al VPS y:
```bash
git reset --hard origin/main && docker compose up -d --build && docker image prune -f
```
**Secrets a configurar** en GitHub → Settings → Secrets and variables → Actions:
| Secret | Valor |
|---|---|
| `SSH_HOST` | IP del VPS |
| `SSH_USER` | usuario SSH |
| `SSH_PASSWORD` | contraseña SSH (o cambia el workflow a `key:` — más seguro) |

> Recomendado: migra a **clave SSH** (`key: ${{ secrets.SSH_KEY }}`) en vez de password.

## 5. Frescura de datos (automática)
- El bot `actualizar-ofertas.yml` re-escanea `ofertas.json` cada 3 h y lo commitea.
- Ese push dispara `deploy.yml` → rebuild → `generarRelampago.js` regenera el
  relámpago (endsAt +24h) → **el carrusel nunca se vacía y los precios se refrescan.**
- El precio en vivo real es imposible (ML da 403 por item); por eso el footer avisa
  "verifica el precio final en ML". Los **links de afiliado** llevan tu código siempre.

## 6. Operación diaria
```bash
docker compose logs -f frontend     # logs de Caddy / sitio
docker compose logs -f backend      # logs del backend
docker compose restart backend      # reiniciar un servicio
docker compose down                 # bajar todo (los volúmenes persisten)
```
**Respaldo de suscriptores** (SQLite en volumen `backend_data`):
```bash
docker compose cp backend:/data/database.sqlite ./backup-$(date +%F).sqlite
# o exporta a CSV:  https://kalidapresio.com/api/export/subscribers?token=TU_EXPORT_TOKEN
```

## 7. Prueba local (opcional, sin dominio)
```bash
# En .env: SITE_ADDRESS=:80
docker compose up --build
# abre http://localhost
```

## Notas
- La SQLite y los certificados TLS viven en **volúmenes** (`backend_data`, `caddy_data`):
  sobreviven a `docker compose up --build`. No los borres.
- El build del frontend re-escanea secciones desde ML; si ML no responde, degrada al
  JSON existente y el build NO falla.
- `node:sqlite` requiere `--experimental-sqlite` (ya está en `backend/Dockerfile`).
