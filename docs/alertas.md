# Alertas de precio: «avísame cuando baje»

En la página de cada producto que seguimos (`/p/<slug>`) hay un formulario:
la persona pone el precio que la convence y su correo. Cuando vemos el
producto a ese precio o menos, le escribimos **una sola vez** con tu link
oficial de afiliado. Es el clic con más intención de compra que puede tener el
sitio: la persona ya decidió que lo quiere y solo esperaba el precio.

Las tarjetas tienen una campanita que lleva al formulario y `/hoy` enlaza
«avísame si baja» en cada producto.

## Cómo funciona

```
/p/<slug>  ──POST /api/alertas──▶  backend: firma un token y manda
                                    «Confirma tu alerta» (no guarda nada)
correo     ──GET /api/alertas/confirmar──▶  se guarda la alerta (activa)

cada 30 min el backend lee /data/precios.json del sitio
  └─ si un producto tiene precio VIGENTE ≤ al que pidió alguien
       └─ manda «¡Bajó!» con el link oficial y la marca disparada
```

- **Solo con precios vigentes.** `/data/precios.json` se genera en cada build
  desde la vitrina (`src/utils/alertas.js`). Un precio cuenta como «de hoy»
  durante los 7 días siguientes a `revisado`, o hasta que termina una
  relámpago. Un precio más bajo pero vencido **no** dispara nada: avisar «bajó»
  con un dato viejo sería mentir.
- **Doble opt-in**, igual que el boletín. Sin confirmar no existe la alerta.
  El correo de confirmación trae también el enlace para cancelarla.
- **Una sola vez.** Al dispararse queda cerrada. Si la persona quiere otra,
  la crea en la página del producto.
- **Siempre por debajo del último precio.** El navegador y el backend
  rechazan una alerta igual o más alta que el precio que vimos.
- **Dura 6 meses.** Las cerradas (disparadas, canceladas o vencidas) se
  borran 90 días después. Máximo 20 alertas activas por correo.
- **Sin productos retirados.** Si lo quitaste de la vitrina ya no lo
  revisamos, así que su página no ofrece alertas.

## Qué la dispara en la práctica

Los precios los revisas tú (el marcador y «Ya revisé: sigue igual» del panel).
Cuando actualizas el precio de un producto y publicas la vitrina, el sitio se
reconstruye y, en menos de media hora, el backend avisa a quien estuviera
esperando ese precio.

Por eso conviene saber **qué productos tienen gente esperando**:

```bash
curl -H "Authorization: Bearer $EXPORT_TOKEN" \
  https://kalidapresio.albis-labs.xyz/api/alertas/resumen
```

Devuelve, por producto, cuántas personas esperan y el precio más alto y más
bajo que pidieron (sin correos). Si 12 personas esperan la licuadora a $1,700,
revisa su precio seguido.

## Configuración

No hace falta nada nuevo: usa los mismos secretos del boletín
(`SUBSCRIBE_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`) y `EXPORT_TOKEN` para el
resumen. Sin `SUBSCRIBE_SECRET` o sin `RESEND_API_KEY` el formulario responde
que las alertas no están disponibles y el revisor no corre.

Opcionales, en `.env.production`:

| Variable | Por defecto | Para qué |
| :--- | :--- | :--- |
| `PRECIOS_URL` | `http://web/data/precios.json` | De dónde lee el backend el catálogo. Por defecto, el contenedor del sitio por la red interna de Docker. |
| `ALERTAS_MINUTOS` | `30` | Cada cuánto revisa (mínimo 5). |

## Endpoints

| Ruta | Qué hace |
| :--- | :--- |
| `POST /api/alertas` | `{email, producto, objetivo}` → manda el correo de confirmación |
| `GET /api/alertas/confirmar?token=…` | Guarda la alerta (se abre desde el correo) |
| `GET /api/alertas/baja?token=…` | La cancela (enlace del correo de confirmación) |
| `GET /api/alertas/resumen` | Cuántas personas esperan cada producto. Pide `Authorization: Bearer <EXPORT_TOKEN>` |

La lógica está en `backend/alertas.js` (con tests en `backend/alertas.test.js`)
y la tabla `alertas` se crea sola al arrancar el backend.

## Privacidad

Se guarda el correo, el producto, el precio pedido y la IP desde la que se
confirmó (evidencia de consentimiento, como en el boletín). Una alerta **no**
suscribe al boletín. Está en el aviso de privacidad (`/privacidad`).
