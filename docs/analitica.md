# Analítica — Umami autoalojado + clics salientes

Hasta ahora el sitio no medía nada. Sin datos no se puede saber si el problema
es **tráfico**, **clic** o **conversión** — y son tres arreglos distintos.

Esta guía levanta Umami en el mismo VPS y explica qué mide el sitio y cómo
leerlo junto al panel de afiliados de Mercado Libre.

---

## Por qué Umami y no Google Analytics

- Corre en **tu** VPS: los datos no salen de tu infraestructura.
- **Sin cookies** → no hace falta banner de consentimiento, y el aviso de
  privacidad sigue siendo cierto.
- Ligero (~2 KB de script) y respeta `Do Not Track`.
- Es software libre: si mañana quieres irte, te llevas la base de Postgres.

Va en **su propio stack** (`/opt/umami`), no dentro del compose de
KalidaPresio: NS Hub y cualquier proyecto futuro pueden usar la misma
instancia dando de alta otro «website» en la interfaz, y redesplegar el sitio
no tira la analítica.

---

## 1. DNS

En Porkbun, un **A record**: `analitica.albis-labs.xyz` → IP del VPS.

## 2. Levantar Umami

```bash
sudo mkdir -p /opt/umami && cd /opt/umami
# Copia docker/analitica/docker-compose.yml de este repo a /opt/umami/
```

Crea `/opt/umami/.env.production`:

```bash
cd /opt/umami
printf 'POSTGRES_PASSWORD=%s\nAPP_SECRET=%s\nTRACKER_SCRIPT_NAME=kp.js\n' \
  "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > .env.production
chmod 600 .env.production
```

⚠️ **Con `$( )`**, no con comillas literales: un `echo "APP_SECRET=openssl rand
-hex 32"` escribe el texto tal cual y deja el panel firmado con una cadena
adivinable.

> `TRACKER_SCRIPT_NAME=kp.js` renombra el script del rastreador. Los
> bloqueadores traen reglas para la ruta `/script.js` de Umami; con otro nombre
> tu dominio deja de coincidir con esas listas. Tiene que **cuadrar** con
> `PUBLIC_UMAMI_SCRIPT` del `.env.production` de KalidaPresio.

```bash
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps      # ambos healthy (la 1ª vez tarda ~1 min)
curl -sI http://127.0.0.1:3100/ | head -1
```

## 3. Publicar con Nginx Proxy Manager

Proxy Host nuevo:

- **Domain Names:** `analitica.albis-labs.xyz`
- **Scheme:** `http` · **Forward Hostname/IP:** `umami` · **Forward Port:** `3000`
  (solo el nombre; una URL completa ahí da 500 de openresty)
- **Block Common Exploits:** on
- **SSL:** *Request a new SSL Certificate* + *Force SSL*

Comprobación:

```bash
docker exec proxy-app-1 curl -sI http://umami:3000 | head -1   # → HTTP/1.1 200 OK
```

## 4. Configurar Umami

1. Entra a `https://analitica.albis-labs.xyz`.
   Credenciales iniciales: usuario `admin`, contraseña `umami`.
2. **Cámbialas de inmediato** (Settings → Profile). El panel es público en
   internet: con la contraseña por defecto, tus métricas también lo son.
3. Settings → Websites → **Add website**:
   - Name: `KalidaPresio`
   - Domain: `kalidapresio.albis-labs.xyz`
4. Copia el **Website ID** (un UUID). Es lo que va en `PUBLIC_UMAMI_ID`.

## 5. Conectar el sitio

En `/opt/kalidapresio/.env.production`:

```bash
PUBLIC_UMAMI_URL=https://analitica.albis-labs.xyz
PUBLIC_UMAMI_ID=<el UUID del paso 4>
PUBLIC_UMAMI_SCRIPT=kp.js           # el NOMBRE, igual que TRACKER_SCRIPT_NAME
```

Son variables **de build**: se hornean en el HTML, así que hace falta
reconstruir.

```bash
cd /opt/kalidapresio
docker compose --env-file .env.production up -d --build
curl -s http://127.0.0.1:8080/ | grep -o 'data-website-id="[^"]*"'
```

> Si las tres variables no están, el componente **no emite ni una etiqueta**.
> El sitio funciona idéntico y en desarrollo no se ensucian las métricas.

---

## Qué se mide

El pageview es ruido. El evento que se traduce en dinero es el **clic saliente**
hacia Mercado Libre.

### `clic-oferta`

Se dispara con cualquier clic en un enlace hacia `mercadolibre.com.mx` o hacia
`/recomienda/*`, venga de donde venga: tarjetas, bento, showpiece, carrusel
relámpago, curados, colecciones o la página 404. Un solo listener delegado en
`document`, así que sobrevive a las View Transitions y no hay que instrumentar
cada componente.

| Propiedad | De dónde sale |
|---|---|
| `seccion` | Sufijo de `matt_word` en el propio enlace |
| `id` | `data-ml-id` de la tarjeta, o el `MLM…` de la URL |
| `precio` · `score` · `descuento` · `categoria` | `data-*` que ya usaban el filtro y el ordenador |
| `destino` | `directo` o `recomienda` (si pasó por el cloaking) |

### `boletin-alta` y `contacto-enviado`

Las otras dos conversiones. Los componentes no conocen Umami: lanzan un
`CustomEvent('kp:evento')` y `Analitica.astro` lo traduce. Si algún día cambias
de herramienta, solo se toca ese archivo.

---

## Cómo leerlo (esto es lo importante)

**`seccion` no es una etiqueta inventada: es el mismo identificador que ves en
tu panel de afiliados de Mercado Libre.** `aLinkAfiliado` compone
`matt_word = <base>_<seccion>`, ML lo registra en las comisiones y el sitio lo
lee del mismo enlace para el evento.

Eso permite cruzar las dos mitades del embudo:

```
Umami          →  cuánta gente hizo clic en «imbatibles»
Panel de ML    →  cuánto se compró desde «imbatibles»
```

Y de ahí salen diagnósticos que antes eran imposibles:

| Síntoma | Qué significa | Qué tocar |
|---|---|---|
| Pocas visitas, buen % de clic | El producto funciona, nadie lo encuentra | SEO y distribución |
| Muchas visitas, pocos clics | Llegan mal cualificados o el CTA no convence | Copy, colecciones perennes |
| Muchos clics, pocas comisiones | Precio desactualizado al llegar a ML, o categoría de comisión baja | Frescura del feed, mezcla de categorías |
| `seccion: sin-etiqueta` | Hay un CTA sin instrumentar | Pásale `campana` a `aLinkAfiliado` |

Ese último es una **sonda**: si aparece en el panel, algún enlace se escapó.
Hoy debería estar en cero.

### Las tres preguntas para empezar

1. **¿Qué sección genera clics por visita?** Si «imbatibles» trae 10× más
   clics que el bento, el bento sobra o está mal colocado.
2. **¿Qué páginas traen visitantes que hacen clic?** Ordena las colecciones por
   clics, no por visitas. Ahí se decide cuál convertir en comparativa perenne.
3. **¿Qué `id` se repite?** Un producto que acumula clics merece su propia
   página. Eso es lo que rankea y lo que compone.

---

## Operación

```bash
cd /opt/umami
docker compose --env-file .env.production logs -f umami
docker compose --env-file .env.production restart umami
```

**Respaldo de las métricas** (todo vive en el volumen `umami_db`):

```bash
mkdir -p /opt/backups
docker exec umami-db pg_dump -U umami umami | gzip > /opt/backups/umami-$(date +%F).sql.gz
```

Semanal, en `/etc/cron.d` (el VPS corre en UTC; 15:00 UTC = 9:00 CDMX):

```bash
printf 'SHELL=/bin/sh\nPATH=/usr/local/bin:/usr/bin:/bin\n30 15 * * 0 root docker exec umami-db pg_dump -U umami umami | gzip > /opt/backups/umami-$(date +\\%%F).sql.gz\n' > /etc/cron.d/umami-backup
chmod 644 /etc/cron.d/umami-backup
```

⚠️ Una línea de crontab **no** es un comando de shell: va dentro de un archivo
de cron, no pegada en la terminal.

---

## Troubleshooting

- **No aparece ninguna visita.** Comprueba que el HTML lleve la etiqueta:
  `curl -s https://kalidapresio.albis-labs.xyz/ | grep data-website-id`. Si no está,
  faltan las variables **en el build** — hace falta `--build`, no basta con
  `up -d`.
- **La etiqueta está pero Umami no registra nada.** Suele ser el `data-domains`:
  el script solo cuenta si el host coincide con `SITE_URL`. Míralo en la
  pestaña de red del navegador; la petición al script debe dar 200.
- **404 al pedir el script.** `PUBLIC_UMAMI_SCRIPT` y `TRACKER_SCRIPT_NAME` no
  cuadran. Los dos tienen que decir lo mismo (`kp.js` ↔ `kp.js`).
- **Se ven pageviews pero ningún `clic-oferta`.** Los eventos personalizados
  necesitan que `window.umami` exista; el componente encola hasta 10 segundos y
  luego se rinde. Si un bloqueador tumbó el script, no hay nada que hacer del
  lado del sitio — es la razón de `TRACKER_SCRIPT_NAME`.
- **`umami-db` no arranca.** La primera migración tarda; el `start_period` del
  healthcheck es de 60 s. Si sigue caído:
  `docker compose --env-file .env.production logs umami-db`.
- **Olvidaste la contraseña del panel.** Se resetea desde la base:
  ver la documentación de Umami (`umami reset-password`).
