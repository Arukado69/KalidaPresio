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

## La forma rápida: pegar lo que te da la app (celular o computadora)

El botón **«Compartir para ganar una comisión»** de la app de Mercado Libre ya
te da casi todo lo que el sitio necesita:

```
¡Mira lo que encontré! Playera Polo Hombre … - $ 99,59 en Mercado Libre.
Entra aquí: https://meli.la/2Gyywqc
```

Título, precio y **tu link oficial**. Entonces:

1. En la app, toca «Compartir para ganar una comisión» en cada producto que
   quieras y **copia el mensaje** (o mándatelo por WhatsApp a ti mismo). Puedes
   juntar varios.
2. Abre `/panel/agregar` y **pégalos todos** en «La forma rápida: pega lo que
   te da la app». Toca **«Agregar a mi vitrina»**.
3. Toca **«Publicar ahora»**. En unos minutos están en el sitio, con su código
   fijo (K-17) y su página.

- El precio queda como **visto hoy** (o el día que elijas, si pegas mensajes
  viejos). A los 7 días sin revisar se esconde solo, como todo.
- Pegar otra vez el mismo mensaje con otro precio **actualiza** ese producto;
  no lo duplica.
- Sin foto, el sitio muestra la categoría en grande; sin calificación ni
  ventas, dice **«sin calificar»** en vez de un Sello K-P de 0.
- **Completarlo después** (foto, calificación, ventas, precio anterior): abre
  la ficha en Mercado Libre en la computadora y usa el marcador; pega el mismo
  link cuando te lo pida. El panel lo reconoce por el link y lo completa.
- El bot de Telegram (n8n) solo publica productos con foto.

### En Android: compartir directo, sin copiar ni pegar

El panel se instala como app y aparece en el menú «Compartir» del celular,
así que el mensaje entra solo:

1. **Una vez:** abre `/panel/agregar` en Chrome, en el celular, y toca
   **«Instalar como app»** (o el menú ⋮ de Chrome → «Instalar app»).
2. En la app de Mercado Libre, en un producto: **«Compartir para ganar una
   comisión»** → elige **KalidaPresio** (si no aparece, búscala en «Más»;
   recién instalada puede tardar unos minutos).
3. Se abre el panel con el producto agregado y te dice cuál entró, a qué
   precio y con qué código. Regresa a Mercado Libre y repite.
4. Al terminar, **«Publicar ahora»**.

- Si compartes con el «Compartir» normal (no el de comisión), el panel te
  avisa: ese link no lleva tu identificador y no se publica.
- El borrador se guarda en el celular aunque cierres la app; nada se publica
  hasta que tocas «Publicar ahora».
- En iPhone no se puede (Apple no deja que una página aparezca en
  «Compartir»): ahí copia y pega.
- Cómo funciona: `public/panel/manifest.json` (su `share_target` manda a
  `/panel/agregar/?titulo=…&texto=…&enlace=…`), `public/panel/sw.js` (sin
  caché, a propósito) y `leerCompartido()` en `src/utils/compartir.js`. Los
  íconos salen de `npm run generar-identidad`.

### ¿Cómo sabe Mercado Libre que la venta es tuya?

Por el link: `meli.la/…` lleva tu identificador de afiliado. Al tocarlo, la
persona pasa por tu perfil de afiliado en Mercado Libre y de ahí al producto,
y Mercado Libre registra el clic a tu nombre. Si compra dentro de la ventana
de atribución (las páginas oficiales de Chile y Argentina dicen **24 horas
desde el clic**, y que tu link sea el **último clic** antes de comprar), la
comisión es tuya. Por eso el sitio publica el link **tal cual**, sin
modificarlo. Las ventas las ves en tu panel de afiliados; los clics que salen
del sitio, en Umami (ver `docs/analitica.md`).

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
| `relampago` + `termina` | Sale en la fila relámpago de la portada con cuenta regresiva real. Sin `termina`, no se muestra cuenta regresiva y se retira sola 12 h después de `revisado`. |
| `destacado` | Lleva un moño en su tarjeta (tu texto, o «Elegido» si pones `true`) y sale antes que el resto en `/hoy`. Puede ser `true` o un texto («Más vendido»). |
| `nota` | Por qué lo recomiendas. Sale en el sitio, en `/hoy` y en las publicaciones. Es lo que ningún otro canal de ofertas puede escribir. |
| `enlaces` | Links oficiales por canal (ver abajo). |
| `codigo` | El **código fijo** del producto: `17` se muestra como **K-17**. Lo pone el panel al guardar; no lo escribas a mano. No cambia nunca, ni al editar, ni al retirar el producto (ver abajo). |
| `vistos` | **Su historial de precios**, lo llena el panel: cada vez que lo compartes, lo pegas, lo guardas o tocas «Ya revisé: sigue igual», anota `["2026-11-05", 1299, 1299]` (día en la Ciudad de México, mínimo y máximo de ese día). No lo escribas a mano. Ver «El historial que juntas tú» abajo. |

En la raíz del archivo, junto a `productos`, el panel guarda **`ultimo_codigo`**:
el código más alto que se ha usado. Así, aunque borres un producto del todo, su
código no se le vuelve a dar a otro.

Además de `productos`, el archivo puede tener **`retirados`**: lo que quitaste
de la vitrina y ya tenía link oficial. No se publica en la portada, el feed ni
`/hoy`, pero **su página sigue en línea** (ver abajo). Cada uno lleva la fecha
en `retirado`.

---

## El historial que juntas tú

El historial de `src/data/historico-precios.json` lo llenaba el bot que leía
Mercado Libre cada 3 horas, y está **congelado desde el 8 de octubre de 2026**
(ML bloquea a los servidores). Además, los productos que llegan desde
«Compartir» de la app no traen id de Mercado Libre: nunca encontrarían su
historia ahí.

Por eso cada producto guarda **los precios que tú viste** (`vistos`). No hay
nada extra que hacer: cada vez que lo **compartes desde la app**, lo **pegas**,
lo **guardas** en el formulario o tocas **«Ya revisé: sigue igual»**, el precio de ese día
se suma a su historial en vez de pisar al anterior. Al publicar, se sube con la
vitrina.

Con eso el sitio dice qué viste y cuándo, nunca un rango que no observó:

| Lo que viste | Lo que dice el sitio |
| :--- | :--- |
| Hoy $1,199; el 5 nov $1,299 | **«Bajó: el 5 nov estaba a $1,299»** (sello verde) |
| Hoy $1,499; el 5 nov $1,299 | **«Lo vimos a $1,299 el 5 nov»** (sello azul; no se reparte en Telegram ni en «Publicar hoy») |
| Hoy $1,350; el 5 nov $1,299 | «Cerca del más bajo que le vimos: $1,299 el 5 nov» |
| El mismo precio las dos veces | «Mismo precio desde el 5 nov» (sello neutro) |
| Una sola vez | Nada en la tarjeta; en su página, «Lo seguimos desde el 5 nov» |

«El precio más bajo en 30 días» solo se dice con seguimiento casi diario (como
el del bot o el del observador de tu computadora): entre dos revisiones sueltas
el precio pudo hacer cualquier cosa. La regla vive en `veredictoPrecio()`
(`src/utils/historico.js`).

**Para el Buen Fin (13 al 17 de noviembre):** comparte tus productos **antes**
del 13 y **otra vez** durante el Buen Fin. Así cada uno dice si bajó de verdad,
si subió antes de «rebajarse» o si sigue igual. El panel te lo dice en cuanto
lo compartes: «Actualizado: … a $1,199 (K-4). Bajó: el 5 nov estaba a $1,299».

## La página de cada producto (`/p/…`)

Cada producto con link oficial tiene su página propia, por ejemplo
`/p/hidrolavadora-electrica-portatil-1600-psi-mlm53177027`: foto, precio, Sello
K-P, tu nota, el veredicto «¿es buen momento?» y la **gráfica de su precio** con
lo que observamos (la línea se corta donde no se miró). Es la que puede salir en
Google cuando alguien busca «<producto> precio» o «<producto> vale la pena».

- **La URL no cambia** aunque corrijas el título: sale de la ficha de Mercado
  Libre y del id del producto.
- **No desaparece**: si el precio lleva más de 7 días sin revisarse o la
  relámpago terminó, la página lo dice arriba y no lo presenta como oferta. Si
  retiras el producto, la página se queda con su historial.
- En el panel, **«Quitar»** retira un producto que ya tenía link (aparece en
  «Retirados», con «Ver su página», «Volver a la vitrina» y «Borrar del todo»).
  Un borrador sin link sí se borra directo: nunca tuvo página.
- El título de cada tarjeta del sitio lleva a esta página; el botón sigue yendo
  directo a Mercado Libre con tu link oficial.

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

## El observador diario (el reloj del Buen Fin)

El veredicto de «descuento falso» necesita **14 días** de precios observados
(con el 70 % de los días cubiertos), y un día sin mirar no se recupera. Mercado
Libre bloquea a GitHub y al VPS, así que el observador corre en **tu
computadora**: lee las 5 primeras páginas de `/ofertas` (con pausas, como una
persona) y guarda los precios en `historico-precios.json`, por artículo y por
catálogo, y la ficha de cada producto (título, URL, foto y descuento anunciado)
en `catalogo-observado.json`. Con las dos cosas se arma el **Detector del Buen
Fin** (`/buen-fin`).

Para probarlo una vez, sin subir nada:

```bash
npm run observar-diario
```

Si dice «Solo 0 artículos observados», Mercado Libre también está bloqueando tu
conexión, y no se registra nada. Si funciona, prográmalo para que corra solo
cada día y suba el histórico:

1. Una copia del repositorio **solo para el observador** (así no se mezcla con
   lo que estés editando), en la rama `main`:

   ```bash
   git clone https://github.com/Arukado69/KalidaPresio.git C:\kalidapresio-observador
   ```

   Luego, dentro de esa carpeta, `npm ci`.

2. En Windows, una tarea diaria (cámbiale la hora si quieres; la PC tiene que
   estar prendida):

   ```bash
   schtasks /Create /SC DAILY /ST 09:07 /TN "KalidaPresio observador" /TR "cmd /c cd /d C:\kalidapresio-observador && npm run observar-diario -- --subir >> observador.log 2>&1"
   ```

Con `--subir`, el observador hace `git pull`, observa, registra y sube **solo**
`historico-precios.json` y `catalogo-observado.json`, **solo** si cambiaron y
**solo** desde `main`. Lo que pasó cada día queda en `observador.log`.

### El Detector del Buen Fin (`/buen-fin`)

Publica el veredicto de cada producto que el observador vio en oferta en los
últimos 3 días, en tres grupos: **descuento falso**, **ha estado más barato** y
**precio realmente bajo**. Usa exactamente las mismas reglas que el histórico
(14 días para acusar, 20 % de descuento mínimo, etc.), y la página las explica
con los números reales.

- Sin observaciones recientes no inventa nada: dice cuál fue la última y que los
  veredictos aparecen cuando haya precios frescos.
- Los enlaces llevan a la ficha del producto **sin comisión**. Solo un producto
  con «precio realmente bajo» que además esté en tu vitrina usa tu link
  oficial. Nunca se cobra por lo que se señala como descuento falso.
- Las fechas del Buen Fin viven en `src/data/buenFin.js`; cámbialas cada año.
  El enlace «Buen Fin» del menú aparece un mes antes y se quita solo al día
  siguiente del cierre.

---

## Publicar

- **`/panel/hoy`** — eliges la red y cada producto te da el texto ya escrito en
  su formato (WhatsApp, estado, Telegram, Facebook, Instagram, TikTok,
  Pinterest, correo), el link del canal y la imagen del tamaño correcto (4:5
  para feed, 9:16 para estados/historias/TikTok). Arriba está el **paquete
  relámpago** (un mensaje con lo mejor del día) y un horario sugerido.
- **`/hoy`** — tu «link en bio». Cada producto lleva su **código fijo**
  (K-17), el mismo del panel, de los textos y de las imágenes verticales. Pon
  `kalidapresio.albis-labs.xyz/hoy?c=ig` en Instagram y `…/hoy?c=tt` en TikTok.
  El código **no cambia** cuando actualizas la vitrina: un video de hace un mes
  que dice «busca el K-17» sigue apuntando al producto correcto. Antes se
  numeraba por posición y «el #3» terminaba en otro producto.
- **`/k/<n>`** — la dirección corta de cada producto: `…/k/17` lleva directo a
  su página (`/p/<slug>`), aunque ya lo hayas retirado. Sirve para decirla en
  un video o ponerla en una imagen.
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
