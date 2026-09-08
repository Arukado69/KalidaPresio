# Histórico profundo — diseño

**Fecha:** 8 de septiembre de 2026
**Estado:** aprobado, pendiente de plan de implementación

---

## El problema

La identidad elegida para KalidaPresio es *«el que te dice cuándo el descuento
es mentira»*. Hoy no se puede sostener, y la causa es medible.

`registrarHistorico.js` lee **únicamente** `src/data/ofertas.json`, que es el
feed de lo que la portada muestra: 40 productos por corrida, extraídos de la
primera página de `mercadolibre.com.mx/ofertas`. Es decir, **lo que seguimos
está atado a lo que mostramos**.

La consecuencia es que un producto deja de existir para nosotros en cuanto ML
lo quita de destacados. El historial se llena de fotos sueltas en vez de series:

| medida | valor (8 sep 2026) |
| :--- | ---: |
| productos en el histórico | 598 |
| con 3 días o más | 190 (32 %) |
| **profundidad mediana** | **1 día** |
| profundidad máxima | 17 días |
| que han cambiado de precio alguna vez | 159 (27 %) |
| productos refrescados por día | ~40 |

Con una mediana de un día no hay nada que afirmar. El veredicto más fuerte que
el 68 % de los productos permite es «seguimos su precio desde hace 1 día», que
no convence a nadie ni diferencia de ningún otro sitio de ofertas.

---

## La restricción

Mercado Libre ya devuelve 403 en su API, así que todo se obtiene raspando HTML.
La decisión del dueño del proyecto es **conservadora**: leer solo **páginas de
listado**, nunca fichas de producto individuales.

Eso importa más de lo que parece, porque **elimina una familia entera de
soluciones**. Sin fichas individuales no se puede ir a buscar el precio de un
producto concreto, y por tanto **una «lista fija de productos a seguir» es
imposible**. Solo se puede elegir *qué listas leer*, no *qué productos*.

El problema se reformula: en vez de seguir productos elegidos, hay que
**ensanchar la red diaria leyendo siempre las mismas listas**, para que los
mismos productos reaparezcan y el historial se acumule solo.

---

## Lo que se descartó, y por qué

Queda escrito para que nadie lo reproponga sin datos nuevos.

### `/mas-vendidos` como fuente de seguimiento

La hipótesis era buena: los más vendidos rotan lento, así que darían historiales
profundos sobre los mismos productos. La página responde 200 y el extractor
(`"appProps":({.*?}),"mainEntry"`) funciona sobre ella: 149 ids únicos.

**Medición (8 sep 2026):**

```
mas-vendidos ∩ ofertas de hoy   :  0 de 40   (0 %)
mas-vendidos ∩ histórico (598)  :  0
```

**Cero solapamiento en ambas direcciones.** Seguir los más vendidos construiría
historial profundo sobre 149 productos que nunca mostramos, y no aportaría ni
una observación a los que sí. Para el objetivo declarado —verificar los
descuentos de las ofertas que publicamos— es inútil.

*(Nota: sigue siendo un catálogo estable e independiente. Si algún día se quiere
una sección propia de «más vendidos con veredicto de precio», esto es un
producto distinto y merece su propio diseño. No es el arreglo de este.)*

### Refrescar los 598 con fichas individuales

Descartado por la restricción conservadora: 598 peticiones diarias a fichas de
producto no se parece a navegación humana, y la API ya está en 403.

---

## El diseño

### Sección 1 — separar lo que seguimos de lo que mostramos

Dos pasadas sobre la misma fuente, con ritmos y propósitos distintos:

| pasada | qué lee | cada cuánto | para qué |
| :--- | :--- | :--- | :--- |
| **feed del sitio** | `/ofertas` p1 | cada 3 h *(sin cambio)* | frescura de lo que se muestra |
| **pasada de histórico** | `/ofertas` p1–p5 | **2 veces al día** (~12 h) | profundidad de lo que se afirma |

**Por qué dos y no ocho:** el histórico acumula por DÍA (min/max por fecha), no
por corrida. Ocho pasadas profundas producirían las mismas entradas que una,
gastando ocho veces más peticiones.

**Por qué dos y no una:** la entrada del día guarda min y max. Con una sola
pasada, min y max son siempre el mismo número y se pierde el movimiento
intradía — justo la señal que delata un descuento que aparece y desaparece en
el mismo día.

**Medición que respalda la paginación (8 sep 2026):**

```
p1=115  p2=113  p3=112  p4=112  p5=113 ids
unión de p1–p5           : 489 ids únicos
p1 ∩ p2                  :  19  (las páginas son casi disjuntas)

de p1–p5, ya en histórico: 137 (28 %)  ← historiales que se PROFUNDIZAN hoy
de p1–p5, nuevos         : 352
```

Refrescar 137 productos ya seguidos frente a los ~40 de hoy es **3.4× más**, y
es exactamente la métrica que mueve la mediana.

**Costo:** de 8 peticiones diarias a **18** (8 del feed + 2×5 de la
pasada). Por debajo del presupuesto conservador.

### Sección 2 — el veredicto del descuento falso

`historico.js` ya tiene niveles que degradan solos:

```
sin-datos → siguiendo (<3 días) → normal / alto / bajo / minimo
```

Falta el que es la marca: un producto que **anuncia un descuento fuerte** y cuyo
histórico muestra que **el precio nunca se movió**. Hoy lo más cercano es `alto`
(«ha estado a $X»), que no es lo mismo.

El nivel nuevo se sitúa por encima de los existentes y solo se emite cuando hay
evidencia suficiente. Los demás siguen degradando igual, así que ningún producto
se queda mudo.

**Condiciones, con valores de partida:**
- el producto anuncia un descuento **≥ 20 %**
- su histórico tiene **≥ 14 días**
- mínimo y máximo históricos coinciden con el precio actual dentro de un **2 %**

Estos tres números son el punto de partida, no un resultado: se eligen para que
la primera versión sea deliberadamente conservadora. El plan puede moverlos, y
deben revisarse cuando haya un mes de datos reales — pero el diseño no se queda
con un hueco que alguien rellene sin criterio.

**Regla de honestidad:** este veredicto acusa a un vendedor de publicidad
engañosa. Con pocos días de historia una afirmación así es irresponsable — el
umbral de días tiene que ser claramente mayor que `DIAS_MINIMOS` (3). Ante la
duda, degradar a `alto` o `normal`, nunca acusar.

---

## Componentes

| archivo | cambio |
| :--- | :--- |
| `src/scripts/importarOfertas.js` | aceptar un rango de páginas; hoy asume una sola |
| `src/scripts/registrarHistorico.js` | leer de la pasada profunda, no de `ofertas.json` |
| `src/utils/historico.js` | el nivel `descuento-falso` en `veredictoPrecio()` |
| `.github/workflows/actualizar-ofertas.yml` | la pasada profunda con su propio ritmo |
| `src/components/` | mostrar el veredicto nuevo donde ya se muestran los otros |

**Frontera que no se cruza:** la pasada profunda **no** toca `ofertas.json`. El
feed del sitio sigue siendo p1 y sigue decidiendo qué se muestra. Si la pasada
profunda falla, la portada no se entera.

## Flujo de datos

```
cada 3 h                      2 veces al día
────────                      ──────────────
importarOfertas.js p1         importarOfertas.js p1-p5
  → src/data/ofertas.json       → observaciones (efímero, no se versiona)
      (versionado)                    │
          │                           ▼
          │                    registrarHistorico.js
          │                      → historico-precios.json (versionado)
          ▼                           │
        el sitio  ◄───────────────────┘
                     veredictoPrecio()
```

## Errores

Se hereda la regla que ya rige el proyecto: **el dato derivado nunca se
versiona; la observación acumulada sí.** Las observaciones de la pasada profunda
son insumo efímero; `historico-precios.json` se versiona y se poda.

- **La pasada profunda falla a media paginación:** se registra lo que se obtuvo.
  Una página menos es menos cobertura, no un dato corrupto.
- **ML cambia el HTML otra vez:** la alarma de frescura existente
  (`verificarFrescura.js`) ya cubre el feed del sitio. La pasada profunda
  necesita su propia señal: si devuelve muchos menos ids de los esperados, hay
  que enterarse. Fallar en silencio es lo que dejó el scraper 43 días muerto.
- **Crecimiento del archivo:** de 598 productos (50 KB) a quizá 2000 (~170 KB),
  commiteado a diario. La poda existente (90 días de historia, fuera a los 30
  sin aparecer) lo estabiliza sola. No se añade un tope artificial todavía; si
  estorba, se añade entonces.

## Pruebas

Lógica pura, con Vitest, como el resto de `src/utils/`:

- `veredictoPrecio()` **no** emite `descuento-falso` por debajo del umbral de días
- **sí** lo emite con historia suficiente y precio plano
- **no** lo emite si el precio se movió alguna vez, por poco que sea
- los niveles existentes siguen degradando igual (no hay regresión)
- `registrarPrecio()` sigue acumulando por día con volumen mayor de entradas

## Criterio de éxito

**No** es «el código funciona». Es que la mediana de profundidad suba. Se mide
con los mismos números de la tabla del problema, a 30 días de desplegado:

- mediana de profundidad: de **1 día** a **7 o más**
- productos con 3+ días: de **32 %** a más del **60 %**
- ofertas vivas con veredicto fuerte (`minimo`, `bajo`, `alto` o
  `descuento-falso`): hoy son 30 de 40; el objetivo es que sea casi todas y que
  el veredicto se apoye en semanas, no en días

Si a 30 días la mediana sigue por debajo de 7, el diseño falló y hay que volver
aquí, no añadir páginas.
