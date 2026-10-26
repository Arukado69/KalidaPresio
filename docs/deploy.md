# Despliegue — KalidaPresio (VPS Hetzner + Docker + Nginx Proxy Manager)

Misma arquitectura que NS Hub: la app corre **dentro de contenedores** y quien
publica el dominio y termina el TLS es **Nginx Proxy Manager**, que ya es dueño
de los puertos 80/443 del VPS.

```
        Porkbun DNS (A @ y www) ──► IP del VPS
                                      │ :80 / :443
                          ┌───────────┴────────────┐
                          │  Nginx Proxy Manager   │  TLS (Let's Encrypt)
                          └───────────┬────────────┘
                                      │  red_global (por nombre de contenedor)
                          ┌───────────┴────────────┐
                          │  kalidapresio_web:80   │  Caddy + sitio Astro SSG
                          │    ├── /recomienda/*   │  → 302 a la portada (viejo)
                          │    ├── /api/*  ────────┼──┐
                          │    └── resto → /srv    │  │
                          └────────────────────────┘  │
                                      ┌───────────────┴──────┐
                                      │ kalidapresio_api:3001│ Express + SQLite
                                      └──────────────────────┘
```

> ⛔️ **Cambio respecto a la guía anterior.** Antes el contenedor de Caddy tomaba
> los puertos 80 y 443 del host y pedía su propio certificado. Eso choca de
> frente con Nginx Proxy Manager, que ya los ocupa. Ahora Caddy escucha en HTTP
> plano dentro de Docker (`SITE_ADDRESS=:80`, `auto_https off`) y NPM le hace
> proxy. También desapareció `functions/` (Cloudflare Pages): el doble opt-in
> del boletín vive ahora en el backend Express, que es el que sí se despliega.

---

## 1. Requisitos en el VPS (una sola vez)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # re-loguéate después
docker --version && docker compose version
```

Nginx Proxy Manager ya debe estar corriendo (es el mismo que sirve NS Hub).
Confirma cómo se llama su red compartida:

```bash
docker network ls | grep -i red_global
```

Si en tu VPS se llama distinto, ajusta `networks.npm.name` en
`docker-compose.yml`.

## 2. Código

```bash
sudo mkdir -p /opt && cd /opt
git clone https://github.com/Arukado69/KalidaPresio.git kalidapresio
cd kalidapresio && git checkout main && git pull
```

> La ruta cambió de `/var/www/kalidapresio` a `/opt/kalidapresio` para quedar
> junto a `/opt/ns-hub`. Si conservas la vieja, cambia el `cd` de
> `.github/workflows/deploy.yml`.

## 3. Variables de entorno → `.env.production`

```bash
cp .env.example .env.production
nano .env.production
chmod 600 .env.production
```

Un solo archivo cubre los dos mundos. Lo mínimo para arrancar:

```bash
# BUILD-TIME (se hornean; cambiarlos exige --build)
SITE_URL=https://kalidapresio.albis-labs.xyz     # ← el build FALLA si falta
# (Ya no hay ML_MATT_*: los links oficiales viven en src/data/vitrina.json.)

# RUNTIME (basta con up -d)
SITE_ADDRESS=:80                       # HTTP plano: el TLS lo da NPM
PUBLIC_SITE_URL=https://kalidapresio.albis-labs.xyz
SUBSCRIBE_SECRET=                      # openssl rand -hex 32
RESEND_API_KEY=
EMAIL_FROM=KalidaPresio <hola@albis-labs.xyz>
SUPPORT_INBOX=hola@albis-labs.xyz
EXPORT_TOKEN=                          # openssl rand -hex 32
```

Genera los dos secretos sin que queden en el historial de la shell:

```bash
cd /opt/kalidapresio
sed -i '/^SUBSCRIBE_SECRET=/d;/^EXPORT_TOKEN=/d' .env.production
printf '\nSUBSCRIBE_SECRET=%s\nEXPORT_TOKEN=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" >> .env.production
grep -c '^SUBSCRIBE_SECRET=\|^EXPORT_TOKEN=' .env.production   # debe dar 2
```

⚠️ **Con `$( )`.** Un `echo "EXPORT_TOKEN=openssl rand -hex 32"` escribe el texto
literal y deja el endpoint de exportación protegido con una cadena adivinable.
El `printf '\n...'` inicial protege contra un archivo sin salto de línea final:
sin él, `>>` pega la variable nueva al final de la anterior y la corrompe en
silencio.

> **Sin `SUBSCRIBE_SECRET` o `RESEND_API_KEY`** el boletín responde 503 a
> propósito (mejor un error claro que juntar correos que nadie puede contestar).
> **Sin `EXPORT_TOKEN`**, `/api/export/subscribers` responde 503 en vez de quedar
> abierto: ya no hay token por defecto.

## 4. Build + arranque

```bash
cd /opt/kalidapresio
docker compose --env-file .env.production up -d --build
```

`--env-file .env.production` es lo que hace que la interpolación `${...}` de
`build.args` lea de ese archivo. **Sin él, `SITE_URL` llega vacía y el build
falla a propósito** — antes no fallaba: publicaba el sitio entero con las
canónicas apuntando a `http://localhost:4321`.

Comprobación en el propio VPS:

```bash
docker compose --env-file .env.production ps        # ambos healthy
curl -I http://127.0.0.1:8080/                      # 200 = el sitio vive
curl -s http://127.0.0.1:8080/ | grep -o 'canonical[^>]*'   # debe decir kalidapresio.albis-labs.xyz
docker compose --env-file .env.production logs -f web
```

## 5. Publicar con Nginx Proxy Manager

NPM corre en Docker y **no** alcanza el `127.0.0.1` del host: llega al
contenedor **por nombre**, a través de `red_global`. El `docker-compose.yml` ya
declara esa red como externa y conecta el contenedor en cada `up -d` — **no uses
`docker network connect` a mano**: esa conexión se pierde cuando compose recrea
el contenedor y NPM se queda dando 502.

```bash
# Sanity check: ¿NPM alcanza al sitio por nombre?
docker exec proxy-app-1 curl -sI http://kalidapresio_web:80 | head -1   # → HTTP/1.1 200 OK
```

En la UI de NPM (`http://<IP-del-VPS>:81`) → **Proxy Hosts → Add Proxy Host**:

- **Domain Names:** `kalidapresio.albis-labs.xyz` y `www.kalidapresio.albis-labs.xyz`
- **Scheme:** `http` · **Forward Hostname/IP:** `kalidapresio_web` · **Forward Port:** `80`
  ⚠️ En *Forward Hostname/IP* va **SOLO el nombre** — nada de `http://` ni `:80`
  ahí. Una URL completa en ese campo genera un upstream inválido y NPM responde
  **500 (openresty)** aunque todo lo demás esté bien.
- **Block Common Exploits:** on · **Websockets Support:** off (el sitio no los usa)
- Pestaña **SSL:** *Request a new SSL Certificate* (Let's Encrypt) + *Force SSL* +
  *HTTP/2 Support*.
- **Custom Nginx Configuration** (engrane ⚙ del diálogo):
  ```nginx
  # El formulario de contacto acepta hasta 4 000 caracteres: de sobra con esto.
  client_max_body_size 1M;

  # Que el backend vea la IP real del visitante. El rate limit de /api la usa
  # para su cubo por IP; sin esto, Express veria siempre la IP de NPM y
  # limitaria a todo el mundo con el mismo contador.
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Real-IP $remote_addr;
  ```
  > El backend espera **dos** saltos de proxy (NPM + Caddy): por eso
  > `TRUST_PROXY: 2` en el compose. Si algún día quitas Caddy de en medio,
  > bájalo a 1.

**Redirección de www a la raíz** (opcional, recomendado para SEO): un segundo
Proxy Host para `www.kalidapresio.albis-labs.xyz` con *Forward* a `kalidapresio.albis-labs.xyz`, o
simplemente incluye ambos dominios en el mismo host — la canónica ya apunta
siempre a la versión sin `www`.

## 6. Actualizar (cada deploy posterior)

El workflow `deploy.yml` lo hace solo en cada push a `main`. A mano:

```bash
cd /opt/kalidapresio
git pull
docker tag kalidapresio_web:latest kalidapresio_web:prev    # respaldo
docker tag kalidapresio_api:latest kalidapresio_api:prev
docker compose --env-file .env.production up -d --build
docker image prune -f
```

> ¿Cambiaste `SITE_URL` o la vitrina? **Siempre `--build`**: sin reconstruir, el
> valor viejo sigue horneado en el HTML.
> ¿Cambiaste solo un secreto de runtime (`RESEND_API_KEY`, `EXPORT_TOKEN`…)?
> Basta `up -d` sin `--build`.

**Secrets de GitHub** (Settings → Secrets and variables → Actions):

| Secret | Valor |
|---|---|
| `SSH_HOST` | IP del VPS |
| `SSH_USER` | usuario SSH |
| `SSH_KEY` | **clave privada** (ya no contraseña) |
| `SSH_PORT` | opcional, por defecto 22 |

Genera el par de claves:

```bash
ssh-keygen -t ed25519 -C "github-actions-kalidapresio" -f deploy_key -N ""
cat deploy_key.pub   # → pégala en ~/.ssh/authorized_keys del VPS
cat deploy_key       # → pégala en el secret SSH_KEY (incluye BEGIN/END)
rm deploy_key deploy_key.pub
```

## 7. Rollback (~30 segundos)

```bash
cd /opt/kalidapresio
docker tag kalidapresio_web:prev kalidapresio_web:latest
docker tag kalidapresio_api:prev kalidapresio_api:latest
docker compose --env-file .env.production up -d          # sin --build
curl -I http://127.0.0.1:8080/
```

Rollback **por código** (volver a un commit concreto):

```bash
cd /opt/kalidapresio
git log --oneline -5
git checkout <commit>
docker compose --env-file .env.production up -d --build
# ... y cuando main esté reparado: git checkout main && git pull && up -d --build
```

## 8. Frescura de los datos

- Los productos y sus precios viven en `src/data/vitrina.json`. Cada vez que lo
  actualizas desde `/panel/agregar` (copiar → pegar en GitHub → commit), el push
  a `main` dispara `deploy.yml` → tests + build en CI → SSH → rebuild en el VPS.
- Un precio con más de 7 días sin revisar se esconde solo; una relámpago se
  retira al llegar a su hora de fin. El panel te marca lo que hay que revisar.
- `actualizar-ofertas.yml` (el scraper de cada 3 h) **está pausado**: desde el
  8 de octubre de 2026 Mercado Libre responde a los servidores con una pantalla
  de «verifica tu cuenta». Queda la ejecución manual en la pestaña *Actions*.
  Si sigue abierto el issue «🔴 El feed de ofertas dejó de refrescarse», ya se
  puede cerrar: el sitio no depende de ese feed.

## 9. Operación diaria

```bash
cd /opt/kalidapresio
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f web    # Caddy / sitio
docker compose --env-file .env.production logs -f api    # boletín / contacto
docker compose --env-file .env.production restart api
```

**Exportar suscriptores** (el token va en la cabecera, ya no en la URL — un
`?token=` se queda escrito en los access logs de NPM y de Caddy):

```bash
TOKEN=$(grep -m1 '^EXPORT_TOKEN=' /opt/kalidapresio/.env.production | cut -d= -f2-)
curl -fsS -H "Authorization: Bearer $TOKEN" \
  https://kalidapresio.albis-labs.xyz/api/export/subscribers -o suscriptores.csv
# ?todos=1 incluye también pendientes y bajas (para auditar la lista)
```

**Respaldo de la base** (SQLite en el volumen `backend_data`):

```bash
docker compose --env-file .env.production cp api:/data/database.sqlite ./backup-$(date +%F).sqlite
```

Automatízalo con un cron semanal (el VPS corre en UTC; 15:00 UTC = 9:00 CDMX):

```bash
printf 'SHELL=/bin/sh\nPATH=/usr/local/bin:/usr/bin:/bin\n0 15 * * 0 root cd /opt/kalidapresio && docker compose --env-file .env.production cp api:/data/database.sqlite /opt/backups/kalida-$(date +\\%%F).sqlite\n' > /etc/cron.d/kalidapresio-backup
chmod 644 /etc/cron.d/kalidapresio-backup
mkdir -p /opt/backups
```

⚠️ **Una línea de crontab no es un comando de shell.** Pegarla en la terminal
devuelve `0: command not found`; va dentro de un archivo de cron.

## 10. Prueba local (sin dominio ni NPM)

```bash
docker network create red_global 2>/dev/null || true
cp .env.example .env.production   # SITE_URL=http://localhost:8080
docker compose --env-file .env.production up --build
# abre http://localhost:8080
```

---

## Troubleshooting

- **502 en NPM tras un `up -d`:** el contenedor no está en `red_global`.
  Verifica con
  `docker inspect kalidapresio_web --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'`
  y que el compose del VPS esté al día (`git pull`). Nunca uses
  `docker network connect` a mano: se pierde al recrear el contenedor.
- **`network red_global declared as external, but could not be found`:** la red
  compartida de NPM se llama distinto. `docker network ls` y ajusta
  `networks.npm.name`.
- **500 (openresty) con los contenedores healthy:** el Proxy Host tiene una URL
  completa en *Forward Hostname/IP*. Ahí va solo `kalidapresio_web`.
- **El build falla con «Falta build-arg SITE_URL»:** olvidaste
  `--env-file .env.production`, o la variable está vacía. Es intencional: sin
  ella el sitio sale con canónicas a localhost y Google lo descarta.
- **Puerto 80/443 ocupado al levantar:** ya no debería pasar — este compose no
  los publica. Si lo ves, tienes una versión vieja del `docker-compose.yml`
  (`git pull`).
- **`/recomienda/<id>` lleva a la portada:** correcto. Eran links armados a mano;
  el sitio ya no redirige a Mercado Libre desde su propio dominio.
- **Un producto no aparece:** abre `/panel/agregar`: cada producto que no se
  publica dice por qué (link no oficial, precio de más de 7 días, relámpago
  terminada…). El log del build lo dice también (`[vitrina]`).
- **El boletín responde 503:** falta `SUBSCRIBE_SECRET` o `RESEND_API_KEY`. El
  log del backend lo dice al arrancar:
  `docker compose --env-file .env.production logs api | head -20`.
- **`No such built-in module: node:sqlite`:** el contenedor arrancó sin
  `--experimental-sqlite`. Ya está en `backend/Dockerfile`; si lo ves, la imagen
  es vieja → `up -d --build`.

## Notas

- La SQLite vive en el volumen `backend_data`: sobrevive a `up -d --build`.
  **No lo borres** y respáldalo (§9).
- El sitio es estático: no hay estado que perder en el contenedor `web`, se
  puede recrear a voluntad.
- Los certificados TLS los gestiona NPM, no este stack. Ya no hay volumen
  `caddy_data` que cuidar.
