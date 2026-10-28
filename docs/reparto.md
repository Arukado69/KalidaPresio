# Reparto — sacar los enlaces del sitio

El sitio es una superficie. Este documento cubre las demás: cómo se publica en
cada una, qué está automatizado y qué no, y dónde está la línea que no conviene
cruzar.

La regla que ordena todo lo de abajo: **cada enlace que sale de aquí es el link
oficial del generador de Mercado Libre, tal cual.** Para que a los 90 días el
panel de afiliados te diga en pesos qué canal mantener, genera un link por
canal con su etiqueta (ver [`vitrina.md`](vitrina.md#separar-las-ventas-por-red-etiquetas)):
un canal sin etiqueta propia se mezcla con el resto.

---

## Las piezas

| Pieza | Qué hace | Dónde |
| :--- | :--- | :--- |
| `vitrina.json` | Tus productos, cada uno con su link oficial (y los de cada canal). La fuente de todo. | `src/data/vitrina.json` |
| `/panel/agregar` | Agrega productos desde la ficha de ML con un marcador del navegador. | el propio sitio |
| `/panel/hoy` | Publicaciones ya escritas para cada red, con el link del canal y la imagen del tamaño correcto. | el propio sitio |
| `/hoy` | Tu «link en bio» numerado para Instagram y TikTok. | el propio sitio |
| `feed.json` | Feed público (esquema 2) con el link oficial y el número de cada producto. Lo consume n8n. | `<sitio>/data/feed.json` |
| Workflow de n8n | Publica en Telegram cada 3 h. | `n8n/telegram-tecnologia.json` |

### Códigos de canal

Viven en [`src/utils/canales.js`](../src/utils/canales.js). Son las claves de
`enlaces` en la vitrina y eligen la plantilla del panel:

| Código | Superficie | Cómo se publica |
| :--- | :--- | :--- |
| `wb` | El sitio | Automático (el build) |
| `wa` | WhatsApp (canal, grupos y estados) | A mano, desde `/panel/hoy` |
| `tg` | Telegram | Automático (n8n) o a mano |
| `fb` | Facebook (página o grupo) | A mano |
| `ig` | Instagram | A mano; el link va en el perfil: `/hoy?c=ig` |
| `tt` | TikTok | A mano; el link va en el perfil: `/hoy?c=tt` |
| `pn` | Pinterest | A mano |
| `cr` | Correo / boletín | A mano |

---

## Montar n8n en el VPS

El workflow de Telegram necesita un n8n donde correr. Va en su propio stack,
igual que Umami, y por la misma razón: redesplegar el sitio no debe tirar el
reparto.

### 1. DNS

En Porkbun, un registro **A**: `n8n.albis-labs.xyz` → la IP del VPS
(`167.233.104.137`).

### 2. El stack

```bash
sudo mkdir -p /opt/n8n && sudo cp /opt/kalidapresio/docker/n8n/docker-compose.yml /opt/n8n/
```

Los secretos, con `$( )` para que el shell **ejecute** `openssl`. Entre
comillas literales escribiría el texto tal cual:

```bash
cd /opt/n8n && printf 'N8N_HOST=n8n.albis-labs.xyz\nN8N_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" > .env.production && chmod 600 .env.production
```

⚠️ **Respalda esa `N8N_ENCRYPTION_KEY` fuera del servidor.** Cifra las
credenciales guardadas, incluido el token del bot. Si se pierde, no hay forma
de recuperarlas: hay que volver a escribirlas todas a mano.

```bash
cd /opt/n8n && docker compose --env-file .env.production up -d
```

Comprueba que arrancó sano y que se unió a la red compartida:

```bash
cd /opt/n8n && docker compose --env-file .env.production ps
```

```bash
docker network inspect red_global --format '{{range .Containers}}{{.Name}} {{end}}'
```

Debe aparecer `n8n` junto a `proxy-app-1`, `kalidapresio_web`, `umami` y
`ns-hub`.

### 3. El Proxy Host

En NPM, **en dos fases** — aprendido a golpes con Umami: si la petición de
certificado falla, NPM **no guarda nada**, y pierdes también el proxy que sí
funcionaba.

**Fase 1**, pestaña Details:

- **Domain Names:** `n8n.albis-labs.xyz` — escríbelo y **pulsa Enter** hasta
  que quede como etiqueta. Si le das a Save con el texto suelto, el campo se
  considera vacío.
- **Scheme:** `http` · **Forward Hostname:** `n8n` · **Forward Port:** `5678`
- **Websockets Support:** **on**. El editor de n8n lo necesita; sin esto la
  interfaz carga pero se queda colgada al guardar un flujo.
- **Cache Assets:** **off**. Es un panel, no un sitio estático.
- SSL: **None** de momento. Guarda y comprueba que responde.

**Fase 2:** edita el host → pestaña SSL → *Request a new SSL Certificate* +
*Force SSL* + *HTTP/2 Support* → Save.

### 4. La cuenta

Entra a `https://n8n.albis-labs.xyz`. La primera visita pide crear la cuenta
dueña — no hay contraseña por defecto que cambiar, a diferencia de Umami.

Con eso ya puedes importar el workflow del paso siguiente.

---

## Telegram, paso a paso

### 1. Crear el canal

En Telegram: **Nuevo canal** → nombre y descripción → **público**, con un
`@usuario` (lo necesitas para que el bot pueda publicar sin conocer un id
numérico).

En la descripción del canal va el aviso de afiliado. No es un trámite: es la
mitad de tu marca. Algo así:

> Ofertas de Mercado Libre México filtradas por el Sello K-P. Te decimos cuándo
> el descuento es falso. Enlaces de afiliado: si compras, recibimos una comisión
> sin costo extra para ti.

### 2. Crear el bot

Habla con **@BotFather** en Telegram → `/newbot` → nombre y usuario. Te devuelve
un **token**.

Ese token es una credencial: no lo pegues en un chat, ni en el repo, ni en un
issue. Va directo a n8n en el paso 4.

### 3. Hacer al bot administrador del canal

Canal → **Administradores** → **Añadir administrador** → busca tu bot → dale
permiso de **Publicar mensajes**. Sin esto el workflow falla con
`403 Forbidden`, que es el error más común y no dice lo que pasa.

### 4. Importar el workflow

En n8n: **Workflows → Import from File** → `n8n/telegram-tecnologia.json`.

Luego, dos cosas:

1. **Nodo `Configuracion`** — es el único que hay que editar:
   - `sitio` → tu dominio (sin barra final)
   - `canal_telegram` → `@tu_canal`
   - `categoria` → vacío publica todas; pon `Tecnología` (u otra) para un canal de nicho
   - `score_minimo` → `0` (la vitrina ya es tu selección; súbelo si quieres filtrar más)
   - `max_por_corrida` → `3`. Con 8 corridas al día son hasta 24 publicaciones;
     súbelo solo si el canal se te queda callado.
2. **Nodo `Publicar en Telegram`** — crea ahí la credencial *Telegram API* y
   pega el token del bot. El archivo no trae credenciales a propósito.

### 5. Probar antes de activar

Dale a **Execute workflow** con el canal ya creado. Si sale bien, verás las
publicaciones en el canal y podrás borrarlas. Recién entonces actívalo.

### Qué hace el workflow, en una frase

Lee `feed.json`, **descarta lo que no tenga link oficial**, las relámpago ya
terminadas y las que han estado más baratas hace poco, quita las que ya
publicó, toma 3 en el orden de `/hoy` y las manda con la tarjeta 4:5 y el link
oficial (el de la etiqueta de Telegram si lo generaste).

Si ya tenías importada la versión anterior, **vuelve a importarla**: la vieja
espera el esquema 1 y se detiene con un error en vez de publicar links viejos.

### Cosas que conviene saber

- **La memoria de lo publicado** vive en el estado del workflow. Si lo borras y
  lo vuelves a importar, empieza de cero y republica. No pasa nada grave, pero
  no lo hagas con el canal ya lleno de gente.
- **El feed manda.** Si el sitio lleva horas sin reconstruirse, n8n publica
  precios viejos. `npm run verificar-frescura` es la alarma que ya tienes.
- **Si cambia `feed.json`** de forma, sube `ESQUEMA` en
  `generarFeedPublico.js`. El workflow se detiene con un error claro en vez de
  publicar mensajes con huecos.

---

## WhatsApp, Instagram, TikTok y todo lo demás: `/panel/hoy`

No hay API pública para canales de WhatsApp ni para publicar en Instagram o
TikTok, y en grupos y comunidades publicar a mano es lo único que respeta sus
reglas. Para eso está `/panel/hoy`.

Eliges la red arriba y cada producto te da la publicación completa en el
formato de esa red —título, precio, señales, tu nota y aviso de afiliado— con
el link oficial del canal, la imagen del tamaño correcto (4:5 o 9:16) y, para
Instagram y TikTok, una idea de video de 15 segundos. Arriba está el **paquete
relámpago**: un solo mensaje con lo mejor del día.

Instagram y TikTok no dejan links en el texto: el texto apunta a `/hoy` con el
número del producto («link en mi perfil, el #3»).

Abajo aparece **«No publicar hoy»** con las ofertas cuyo descuento es contra un
precio inflado, y el porqué. Esa lista es tan importante como la otra.

La página va con `noindex`, fuera del sitemap y con `Disallow` en `robots.txt`,
pero **es pública para quien tenga la URL**: no lleva secretos, solo ofertas que
ya están publicadas, así que no pasa nada — pero no la enlaces desde el sitio.

---

## Dónde repartir, y dónde no

La pregunta natural es «¿cómo pego mis enlaces en la mayor cantidad de grupos
posible?». La respuesta honesta es que ese camino no funciona, y no por moral:
funciona mal en números.

**Lo que pasa cuando se hace así.** Casi todas las comunidades de ofertas de
México —PromoDescuentos, los grupos grandes de Facebook, los subreddits—
prohíben los enlaces de afiliado o los limitan fuerte. Publicar el mismo enlace
en veinte grupos te expulsa de los veinte en cuestión de días, normalmente antes
de la primera venta. Y hay un riesgo peor detrás: el programa de afiliados de ML
tiene sus propias reglas sobre dónde y cómo se promocionan los enlaces. Perder
esa cuenta apaga el proyecto entero, no un canal.

**Lo que sí funciona**, y es más aburrido:

1. **Superficies propias primero.** Tu canal de Telegram, tu canal de WhatsApp,
   tu lista de correo. Ahí publicas lo que quieras, nadie te expulsa, y la
   audiencia es tuya. Un canal de 400 personas que compran vale más que veinte
   mil que te vieron una vez antes de reportarte.
2. **En comunidades ajenas, eres una persona, no un feed.** Participa,
   responde dudas de compra, comparte hallazgos sin enlace. Cuando ya seas
   alguien conocido ahí, un enlace ocasional pasa como recomendación, no como
   spam. Lee las reglas de cada comunidad **antes** de publicar.
3. **El contenido que sí se comparte solo.** El «descuento fantasma»: captura,
   dos precios, la fecha. Eso no es un enlace de afiliado, es información — se
   puede publicar en cualquier lado, la gente lo reenvía, y te deja como la
   persona que sabe. Los enlaces vienen después, a tu canal.

### Tu marca personal es lo que hace que esto sume

Repartir enlaces sueltos no acumula nada: cada uno se gasta y desaparece. Lo que
acumula es que la gente reconozca de quién vienen.

- **Mismo nombre, mismo avatar, mismo tono** en todas las superficies. Si en
  Telegram eres KalidaPresio y en WhatsApp otra cosa, empiezas de cero en cada
  una.
- **Una sola promesa, repetida:** *te digo cuándo el descuento es mentira.* No
  «las mejores ofertas», que es lo que dicen todos.
- **Declara la afiliación siempre.** En la descripción del canal, en el pie del
  correo, en el texto del video. Tu marca entera es decir la verdad sobre
  precios; un enlace disfrazado la tumba de un golpe, y ya no la recuperas.
- **Todo apunta a algo tuyo.** El video lleva al canal, el canal lleva al
  boletín. Las plataformas cambian las reglas cuando quieren; el correo no.

### A los 90 días

Abre el panel de afiliados de ML y compara las etiquetas de cada canal. Cierra
el que no venda y mete ese tiempo en el que sí. Para eso se etiquetó todo
desde el principio.
