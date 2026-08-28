# Reparto — sacar los enlaces del sitio

El sitio es una superficie. Este documento cubre las demás: cómo se publica en
cada una, qué está automatizado y qué no, y dónde está la línea que no conviene
cruzar.

La regla que ordena todo lo de abajo: **cada enlace que sale de aquí lleva el
código de su canal**, así que a los 90 días el panel de afiliados de Mercado
Libre puede decirte, en pesos, cuál mantener y cuál cerrar. Un canal sin
etiquetar no es un canal: es ruido que no vas a poder evaluar.

---

## Las piezas

| Pieza | Qué hace | Dónde |
| :--- | :--- | :--- |
| `feed.json` | Feed público con precio, Sello K-P y **veredicto de precio**. Lo consume todo lo de fuera. | `<sitio>/data/feed.json` |
| `/r/<canal>/<id>` | Enlace corto que estampa el canal y redirige a ML. Sobrevive a que la oferta salga del feed. | backend Express |
| Workflow de n8n | Publica en Telegram cada 3 h, filtrado a Tecnología. | `n8n/telegram-tecnologia.json` |
| `/panel/hoy` | Publicaciones ya armadas para copiar y pegar donde no hay API. | el propio sitio |
| `npm run detectar-nichos` | Qué categoría aguanta un canal propio. | terminal |

### Códigos de canal

Viven en [`src/utils/canales.js`](../src/utils/canales.js). Son dos letras y
viajan dentro del `matt_word`:

| Código | Superficie | Cómo se publica |
| :--- | :--- | :--- |
| `wb` | El sitio | Automático (el build) |
| `tg` | Telegram | Automático (n8n) |
| `wa` | Canal de WhatsApp | A mano, desde `/panel/hoy` |
| `vv` | Video vertical | A mano |
| `pn` | Pinterest | A mano por ahora |
| `cr` | Correo / boletín | A mano |
| `rs` | Sindicación | Automático |
| `cm` | Comunidades y grupos | A mano, y con cuidado — ver abajo |

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
   - `categoria` → `Tecnología` (cámbialo cuando el detector diga otra cosa)
   - `score_minimo` → `85`
   - `max_por_corrida` → `3`. Con 8 corridas al día son hasta 24 publicaciones;
     súbelo solo si el canal se te queda callado.
2. **Nodo `Publicar en Telegram`** — crea ahí la credencial *Telegram API* y
   pega el token del bot. El archivo no trae credenciales a propósito.

### 5. Probar antes de activar

Dale a **Execute workflow** con el canal ya creado. Si sale bien, verás las
publicaciones en el canal y podrás borrarlas. Recién entonces actívalo.

### Qué hace el workflow, en una frase

Lee `feed.json`, se queda con Tecnología con Sello K-P ≥ 85, **descarta las que
han estado más baratas hace poco**, quita las que ya publicó, ordena por Sello
K-P, toma 3 y las manda con foto y enlace `/r/tg/<id>?s=tecnologia`.

Ese descarte es el punto entero. El nodo lleva un comentario que dice por qué:
publicar un descuento contra un precio inflado es lo que hacen los otros veinte
canales de ofertas, y no hacerlo es la única razón por la que alguien seguiría
el tuyo.

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

## WhatsApp, grupos y todo lo demás: `/panel/hoy`

No hay API pública para canales de WhatsApp, y en grupos y comunidades publicar
a mano es lo único que respeta sus reglas. Para eso está `/panel/hoy`.

Eliges el canal arriba y cada tarjeta te da la publicación completa —título,
precio, Sello K-P, veredicto de precio y aviso de afiliado— con el enlace ya
etiquetado. Dos toques desde el teléfono.

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

Abre el panel de afiliados de ML y mira los sufijos `_tg`, `_wa`, `_pn`, `_cr`,
`_cm`. Cierra el que no aparezca y mete ese tiempo en el que sí. Para eso se
etiquetó todo desde el principio.

Y para las cuentas propias, la consulta está en el backend:

```sql
SELECT canal, COUNT(*) AS clics FROM clics
WHERE fecha >= datetime('now','-30 days')
GROUP BY canal ORDER BY clics DESC;
```
