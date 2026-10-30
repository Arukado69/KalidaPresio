# La vitrina: tus productos con link oficial

Todo lo que publica KalidaPresio (el sitio, `/hoy`, el panel de publicación,
el bot de Telegram y las imágenes) sale de **un solo archivo**:
[`src/data/vitrina.json`](../src/data/vitrina.json). Cada producto lleva **tu
link oficial de afiliado**, el que te da el generador de Mercado Libre, pegado
sin editar.

---

## Por qué cambió (octubre 2026)

Había dos problemas, y los dos se resuelven con lo mismo.

1. **Los links no eran oficiales.** El sitio tomaba la URL del producto y le
   pegaba `?matt_tool=68549198&matt_word=ci20241127172754_<canal><sección>`.
   Mercado Libre no documenta que eso funcione, la etiqueta con sufijo no
   existía en tu panel y sus términos piden publicar el link del generador
   **sin editarlo**. Ari compró por uno de esos links y la comisión no apareció.
2. **El catálogo automático murió.** Desde el 8 de octubre de 2026 Mercado
   Libre responde a los servidores (GitHub, el VPS) con una pantalla de
   «verifica tu cuenta». El bot que raspaba ofertas cada 3 horas falló en cada
   corrida desde entonces, y el sitio mostraba precios del 8 de octubre.

Como el link oficial solo se puede generar a mano desde tu cuenta (no hay API
pública), el sitio ahora sale de lo que **tú** eliges. Menos productos, pero
cada uno cobra.

---

## Agregar un producto (2 minutos, en la computadora)

### Una sola vez: instala el marcador

1. Abre `https://kalidapresio.albis-labs.xyz/panel/agregar`.
2. Arrastra el botón **«➕ Agregar a KalidaPresio»** a tu barra de marcadores
   (si no la ves: `Ctrl/Cmd + Shift + B`).

### Cada producto

1. En Mercado Libre, **con tu sesión iniciada**, abre la página del producto.
2. Genera tu link con **«Compartir»** en la barra azul de afiliados y cópialo.
3. Toca el marcador. Te pide el link (si dejaste abierto el cuadro de
   «Compartir», ya viene puesto). Acepta.
4. Se abre el panel con **todo lleno**: título, precio, precio anterior, foto,
   calificación, vendidos, envío gratis y, si es relámpago, su hora de fin.
   Revísalo, agrega tu nota si quieres y toca **«Guardar en la lista»**.

### Subir los cambios

Lo que guardas queda en tu navegador hasta que lo subes. En la barra de abajo,
**«Publicar ahora»**: el panel hace el commit en GitHub por ti, GitHub corre
los tests, construye el sitio y lo publica en el VPS. En unos minutos está en
línea.

La primera vez te pide un **token de GitHub** (se crea una sola vez, también
desde el celular):

1. Abre <https://github.com/settings/personal-access-tokens/new> (token
   «fine-grained»).
2. **Repository access:** «Only select repositories» → solo `KalidaPresio`.
3. **Permissions → Repository permissions → Contents:** «Read and write».
   Nada más.
4. **Expiration:** 90 días. Genera el token, cópialo y pégalo en el panel.

El token se guarda **solo en ese navegador**; el sitio no lo ve ni lo guarda.
Solo puede escribir archivos de este repositorio (sin permiso de Workflows no
toca `.github/`), y el panel solo escribe `src/data/vitrina.json`. Si caduca o
lo pierdes, bórralo en GitHub y crea otro; en el panel está «Olvidar el token
de este navegador».

Si la vitrina cambió en GitHub por otro lado desde la última vez que la viste
en el panel, «Publicar ahora» te pregunta antes de reemplazarla.

**Sin token**, lo de siempre: «Copiar vitrina.json» → «Abrir en GitHub y
pegar» → selecciona todo, pega y toca **«Commit changes»**.

> Si un producto no se puede publicar (link que no es oficial, falta precio,
> relámpago terminada…), el panel te dice exactamente qué le falta, y el
> resto del sitio sale igual.

### Desde el celular

El marcador es para la computadora. En el teléfono, usa **«Ideas para
empezar»** al final de `/panel/agregar`:

1. Toca **«Agregar esta»**: se llena el formulario (título, foto, calificación,
   vendidos y el id de artículo para el histórico) y se abre la ficha en
   Mercado Libre.
2. En la app de Mercado Libre, comparte como afiliado y copia tu link.
3. Vuelve al panel, pega el link y **escribe el precio que ves hoy**: el de la
   idea es de otro día y sale solo como pista.
4. **«Guardar en la lista»** y, cuando termines, **«Publicar ahora»**.

También puedes llenar el formulario a mano con cualquier producto: link
oficial, título y precio bastan.

---

## Qué hace cada campo

| Campo | Para qué |
| :--- | :--- |
| `link` | **Obligatorio.** El link corto oficial: `https://meli.la/…` o `https://mercadolibre.com/sec/…`. Una URL de producto con `matt_tool` se rechaza. |
| `titulo`, `precio` | Obligatorios. |
| `revisado` | Cuándo viste ese precio. El panel lo pone al guardar. **A los 7 días sin revisar, el producto se esconde** hasta que lo confirmes. |
| `precio_antes` | El precio tachado. Con él se calcula el descuento. |
| `url_producto` | La ficha en Mercado Libre. Sirve para «Abrir en ML» y para que el marcador reconozca el producto si lo vuelves a abrir (actualiza el precio en vez de duplicarlo). |
| `id_articulo` | El id de la publicación que gana la ficha (`MLM…`). Lo llena el marcador cuando la página lo trae. El histórico de precios se guardó por artículo y la vitrina identifica por catálogo (`/p/MLM…`): con las dos claves, el producto encuentra su historial. Si queda vacío, no pasa nada. |
| `imagen`, `rating`, `vendidos`, `envio_gratis` | Lo que se ve en la tarjeta y calcula el Sello K-P. |
| `relampago` + `termina` | Sale en el carrusel relámpago con cuenta regresiva real. Sin `termina`, no se muestra cuenta regresiva y se retira sola 12 h después de `revisado`. |
| `destacado` | Sale en «Elegidos por nosotros». Puede ser `true` o un texto («Más vendido»). |
| `nota` | Por qué lo recomiendas. Sale en el sitio, en `/hoy` y en las publicaciones. Es lo que ningún otro canal de ofertas puede escribir. |
| `enlaces` | Links oficiales por canal (ver abajo). |

---

## Separar las ventas por red (etiquetas)

Para saber en pesos si vende más WhatsApp, Telegram o TikTok, lo único que
Mercado Libre reconoce son **las etiquetas que das de alta en tu panel de
afiliados**:

1. En tu panel de afiliados, crea una etiqueta por canal: `whatsapp`,
   `telegram`, `instagram`, `tiktok`…
2. Al generar el link de un producto, elige la etiqueta y genera uno por canal.
3. Pégalos en **«Links por canal»** del formulario. Quedan en `enlaces`:

```json
"enlaces": { "wa": "https://meli.la/…", "tg": "https://meli.la/…", "ig": "https://meli.la/…" }
```

Desde ahí todo los usa solo: el panel de publicación copia el de WhatsApp
cuando publicas en WhatsApp, el bot usa el de Telegram, y `/hoy?c=ig` usa el
de Instagram. Si un canal no tiene link propio, se usa el general.

Códigos: `wa` WhatsApp · `tg` Telegram · `fb` Facebook · `ig` Instagram ·
`tt` TikTok · `pn` Pinterest · `cr` Correo.

---

## La alarma (y el build diario)

El sitio se reconstruye **solo, cada día a las 05:41 (CDMX)**, aunque nadie haga
push: así la regla de los 7 días esconde de verdad los precios que nadie volvió
a revisar. Al terminar cada deploy corre la **alarma de la vitrina**
(`.github/workflows/alarma-vitrina.yml`), que mira el archivo y el sitio en vivo:

- 🔴 **Alarma** — el sitio publica menos de 3 productos, el feed en vivo no
  responde, muestra precios vencidos o lleva más de 30 h sin reconstruirse.
- 🟡 **Aviso** — productos cuyo precio se esconde en menos de 48 h.

Todo va en **un solo issue** con la etiqueta `alarma-vitrina`: se abre cuando
hay algo que atender (GitHub te manda un correo), se comenta solo cuando aparece
algo nuevo y se cierra solo cuando todo está en orden. Para ver lo mismo en tu
computadora: `npm run revisar-vitrina`.

---

## Publicar

- **`/panel/hoy`** — eliges la red y cada producto te da el texto ya escrito en
  su formato (WhatsApp, estado, Telegram, Facebook, Instagram, TikTok,
  Pinterest, correo), el link del canal y la imagen del tamaño correcto (4:5
  para feed, 9:16 para estados/historias/TikTok). Arriba está el **paquete
  relámpago** (un mensaje con lo mejor del día) y un horario sugerido.
- **`/hoy`** — tu «link en bio». Productos numerados (#1, #2…), los mismos
  números del panel y de las imágenes verticales. Pon
  `kalidapresio.albis-labs.xyz/hoy?c=ig` en Instagram y `…/hoy?c=tt` en TikTok.
  Los números cambian cuando actualizas la vitrina: úsalos en contenido del día.
- **Telegram automático** — el flujo de n8n (`n8n/telegram-tecnologia.json`)
  lee `feed.json` y publica solo. Si ya lo tenías importado, **vuelve a
  importarlo**: el anterior espera el esquema 1 y se detiene con un error
  (a propósito) en vez de publicar links viejos.

---

## «Compré por mi link y no me apareció la comisión»

Antes de suponer que algo está roto, revisa en este orden:

1. **¿Aparece el clic en tu panel de afiliados?** Si no aparece ni el clic,
   el link no es el oficial (o se editó).
2. **¿Quién compró?** Según las guías del programa, no cuentan las compras de
   cuentas vinculadas a ti: mismo teléfono, misma red de internet o misma
   dirección de entrega. Una prueba hecha desde tu WiFi no sirve.
3. **¿Cuánto tardó en comprar?** La ventana tras el clic es corta (las guías
   hablan de 24 horas). Confírmalo en los términos de tu país.
4. **¿El producto participa?** No todas las categorías pagan (Alimentos y
   bebidas paga 0 %) y las comisiones cambian.
5. **¿Declaraste ese medio?** El sitio y tus canales tienen que estar dados de
   alta en tu perfil de afiliado.
6. **¿Ya pasó la validación?** La comisión aparece como pendiente y se
   confirma después de la entrega.

Para una prueba limpia: genera un link oficial y pide a alguien **que no
comparta red ni dirección contigo** que compre algo barato por ahí ese mismo
día.

---

## Lo que ya no existe

- `ML_MATT_TOOL` / `ML_MATT_WORD`: el sitio ya no arma links.
- `/recomienda/<id>`: ahora manda a la portada. El sitio no redirige a
  Mercado Libre desde su propio dominio.
- `/r/<canal>/<id>`: los que siguen publicados llevan a la ficha del producto
  (sin parámetros) o a la portada. Ningún enlace nuevo los usa.
- `curados.json`: los «Elegidos» son los productos de la vitrina con
  `"destacado": true`. Tus tres anteriores (CeraVe, Galaxy A16, bocina Aiwa)
  están en la vitrina esperando su link oficial.
- El bot de cada 3 horas: el workflow sigue ahí, pero solo se corre a mano
  (pestaña *Actions*), por si Mercado Libre vuelve a permitirlo.
