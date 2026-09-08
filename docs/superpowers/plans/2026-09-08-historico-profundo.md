# Histórico profundo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar profundidad al histórico de precios leyendo `/ofertas` p1–p5 en una pasada aparte, y añadir el veredicto `descuento-falso` que sostiene la identidad del proyecto.

**Architecture:** Se separa *lo que seguimos* de *lo que mostramos*. El núcleo de scraping (URL, descarga, extracción de `appProps`) sale de `importarOfertas.js` a un módulo compartido con tests. Un script nuevo lo usa sobre 5 páginas, sin filtro de calidad, y escribe observaciones efímeras. `registrarHistorico.js` pasa a leer **las dos** fuentes. El veredicto nuevo vive en `historico.js` junto a los existentes.

**Tech Stack:** Node 22 (ESM), Vitest, Astro 6. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-08-historico-profundo-design.md`

## Global Constraints

- **Solo páginas de listado.** Nunca fichas de producto individuales. Decisión del dueño; la API de ML devuelve 403.
- **Presupuesto de peticiones:** 18 diarias (8 del feed + 2 pasadas × 5 páginas).
- **Umbrales de partida del veredicto:** descuento ≥ **20 %**, historia ≥ **14 días**, precio plano dentro del **2 %**.
- **Regla de honestidad:** ante la duda, degradar a un nivel más débil. Nunca acusar a un vendedor sin evidencia suficiente.
- **Dato derivado nunca se versiona; observación acumulada sí.** `observaciones.json` va a `.gitignore`; `historico-precios.json` no.
- **La pasada profunda NO escribe `ofertas.json`.** Si falla, la portada no se entera.
- **Idioma:** identificadores, comentarios y textos de interfaz en español, como todo el repo.

---

## File Structure

| archivo | responsabilidad |
| :--- | :--- |
| `src/utils/scrapeOfertas.js` | **nuevo** — URL por página, descarga y extracción de `appProps`. Sin filtros, sin disco. |
| `src/utils/scrapeOfertas.test.js` | **nuevo** — tests de lo puro (`urlPagina`, `extraerAppProps`). |
| `src/scripts/importarOfertas.js` | modificar — consume el módulo nuevo. Comportamiento idéntico. |
| `src/scripts/observarPrecios.js` | **nuevo** — pasada profunda p1–p5 → `observaciones.json`. |
| `src/scripts/registrarHistorico.js` | modificar — lee observaciones **y** ofertas. |
| `src/utils/historico.js` | modificar — nivel `descuento-falso`; quitar la rama muerta `normal`. |
| `src/utils/historico.test.js` | modificar — tests del nivel nuevo. |
| `src/components/TarjetaOferta.astro` | modificar — estilo del nivel nuevo. |
| `src/pages/panel/hoy.astro` | modificar — `descuento-falso` entra en «no publicar». |
| `src/scripts/generarFeedPublico.js` | modificar — actualizar el comentario de la unión de niveles. |
| `.github/workflows/actualizar-ofertas.yml` | modificar — la pasada profunda con su propio ritmo. |

**Hallazgo previo que este plan corrige:** en `historico.js` la rama `normal` (línea 104) es **inalcanzable**. Las tres condiciones anteriores (`p <= min*1.02`, `p <= min*1.10`, `p > min*1.10`) cubren todos los reales, así que ese `return` nunca se ejecuta. Se elimina en la Task 4.

---

### Task 1: Núcleo de scraping compartido

**Files:**
- Create: `src/utils/scrapeOfertas.js`
- Create: `src/utils/scrapeOfertas.test.js`
- Modify: `src/scripts/importarOfertas.js:30-48`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: `URL_OFERTAS: string`, `UA: string`, `urlPagina(pagina?: number): string`, `extraerAppProps(html: string): object[]`, `descargarPagina(pagina?: number, opciones?: {timeoutMs?: number, fetchImpl?: typeof fetch}): Promise<string>`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/utils/scrapeOfertas.test.js`:

```js
/**
 * Tests del núcleo de scraping.
 *
 * Lo que se protege: que la paginación produzca las URLs que ML entiende y que
 * el extractor grite en vez de devolver vacío cuando el HTML cambia. Un
 * extractor que devuelve [] en silencio es exactamente lo que dejó el feed 43
 * días muerto sin que nadie se enterara.
 */
import { describe, it, expect } from 'vitest';
import { urlPagina, extraerAppProps, URL_OFERTAS } from './scrapeOfertas.js';

describe('urlPagina', () => {
  it('la página 1 es la URL desnuda, sin query', () => {
    expect(urlPagina(1)).toBe(URL_OFERTAS);
    expect(urlPagina()).toBe(URL_OFERTAS);
  });

  it('de la 2 en adelante añade ?page=', () => {
    expect(urlPagina(2)).toBe(`${URL_OFERTAS}?page=2`);
    expect(urlPagina(5)).toBe(`${URL_OFERTAS}?page=5`);
  });

  it('rechaza páginas que no son enteros positivos', () => {
    expect(() => urlPagina(0)).toThrow();
    expect(() => urlPagina(-1)).toThrow();
    expect(() => urlPagina(1.5)).toThrow();
    expect(() => urlPagina('dos')).toThrow();
  });
});

describe('extraerAppProps', () => {
  const envolver = (items) =>
    `<html><script>window.x={"appProps":${JSON.stringify({ pageProps: { data: { items } } })},"mainEntry":1}</script></html>`;

  it('saca los items del payload', () => {
    const items = extraerAppProps(envolver([{ card: { metadata: { id: 'MLM1' } } }]));
    expect(items).toHaveLength(1);
    expect(items[0].card.metadata.id).toBe('MLM1');
  });

  it('devuelve lista vacía si el payload trae cero items, sin reventar', () => {
    expect(extraerAppProps(envolver([]))).toEqual([]);
  });

  it('LANZA si no encuentra appProps — no devuelve vacío en silencio', () => {
    expect(() => extraerAppProps('<html>nada</html>')).toThrow(/appProps/);
    expect(() => extraerAppProps('')).toThrow(/appProps/);
    expect(() => extraerAppProps(null)).toThrow(/appProps/);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/utils/scrapeOfertas.test.js`
Expected: FAIL — `Failed to resolve import "./scrapeOfertas.js"`

- [ ] **Step 3: Escribir el módulo**

Crear `src/utils/scrapeOfertas.js`:

```js
/**
 * scrapeOfertas — el núcleo de leer /ofertas de Mercado Libre.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * Esto vivía dentro de importarOfertas.js, que además filtra por calidad y
 * escribe ofertas.json. La pasada del histórico necesita lo mismo pero SIN el
 * filtro y sobre varias páginas, así que o se compartía o se copiaba. Copiar
 * la lectura de ML ya salió caro una vez: cuando ML renombró sus componentes
 * en julio de 2026, la copia que alimentaba el sitio se rompió 43 días en
 * silencio mientras la otra seguía bien.
 *
 * Sin disco y sin filtros de negocio: solo URL, descarga y extracción.
 */

export const URL_OFERTAS = 'https://www.mercadolibre.com.mx/ofertas';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * URL de la página N del listado de ofertas.
 * La 1 va sin query: es la URL canónica y la que el feed del sitio usa.
 *
 * @param {number} [pagina=1]
 * @returns {string}
 */
export function urlPagina(pagina = 1) {
  const n = Number(pagina);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Página inválida: ${pagina}. Debe ser un entero ≥ 1.`);
  }
  return n === 1 ? URL_OFERTAS : `${URL_OFERTAS}?page=${n}`;
}

/**
 * Saca los items del payload embebido en el HTML.
 *
 * LANZA si no lo encuentra, y eso es deliberado: devolver [] haría que quien
 * llama escribiera un feed vacío creyendo que hoy no hubo ofertas.
 *
 * @param {string} html
 * @returns {object[]} items crudos de ML (para pasar a leerTarjeta)
 */
export function extraerAppProps(html) {
  const match = String(html ?? '').match(/"appProps":({.*?}),"mainEntry"/s);
  if (!match) {
    throw new Error('No se encontró "appProps" en el HTML (¿cambió la estructura de ML?).');
  }
  return JSON.parse(match[1]).pageProps.data.items ?? [];
}

/**
 * Descarga una página del listado.
 *
 * @param {number} [pagina=1]
 * @param {{timeoutMs?: number, fetchImpl?: typeof fetch}} [opciones]
 * @returns {Promise<string>} HTML
 */
export async function descargarPagina(pagina = 1, { timeoutMs = 30_000, fetchImpl = fetch } = {}) {
  const url = urlPagina(pagina);
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.9' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  return await res.text();
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/utils/scrapeOfertas.test.js`
Expected: PASS — 6 tests

- [ ] **Step 5: Refactorizar importarOfertas.js para consumirlo**

En `src/scripts/importarOfertas.js`, añadir al bloque de imports:

```js
import { descargarPagina, extraerAppProps, URL_OFERTAS } from '../utils/scrapeOfertas.js';
```

Borrar las constantes `URL_OFERTAS` y `UA` locales (líneas ~30 y ~35), y sustituir las funciones `descargarHtml()` y el cuerpo del regex de `extraerDatosBase()` por:

```js
async function descargarHtml() {
  return await descargarPagina(1);
}

function extraerDatosBase(html) {
  const items = extraerAppProps(html);

  // La lectura de cada tarjeta vive en src/utils/mlPayload.js: una sola vez,
  // pura y con tests.
  const aAfiliado = (url) => `${url.split('?')[0]}?matt_tool=${MATT_TOOL}&matt_word=${MATT_WORD}`;

  return items.map((item) => leerTarjeta(item, aAfiliado)).filter(Boolean);
}
```

- [ ] **Step 6: Verificar que no hubo regresión**

Run: `npx vitest run && node src/scripts/importarOfertas.js`
Expected: los 135 tests siguen en verde, y el script imprime `💾 ofertas.json actualizado con N productos`. `git diff --stat src/data/ofertas.json` puede mostrar cambios de precio (normal, son datos frescos), pero el número de items debe ser del mismo orden que antes (~40).

- [ ] **Step 7: Commit**

```bash
git add src/utils/scrapeOfertas.js src/utils/scrapeOfertas.test.js src/scripts/importarOfertas.js
git commit -m "refactor: el núcleo de leer /ofertas sale a su propio módulo con tests"
```

---

### Task 2: La pasada profunda

**Files:**
- Create: `src/scripts/observarPrecios.js`
- Modify: `.gitignore`
- Modify: `package.json` (bloque `scripts`)

**Interfaces:**
- Consumes: `descargarPagina`, `extraerAppProps` de Task 1; `leerTarjeta(item, aAfiliado)` de `src/utils/mlPayload.js`, que devuelve `{id, titulo, precio_actual, precio_previo, descuento, ...}` o `null`.
- Produces: el archivo `src/data/observaciones.json` con la forma `{generadoEl: string, paginas: number, total: number, precios: Record<string, number>}`.

- [ ] **Step 1: Escribir el script**

Crear `src/scripts/observarPrecios.js`:

```js
/**
 * observarPrecios — la pasada PROFUNDA, solo para el histórico.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * El feed del sitio lee la página 1 y se queda con ~40 ofertas que superan el
 * filtro de calidad. Eso ataba lo que SEGUIMOS a lo que MOSTRAMOS: un producto
 * dejaba de existir para nosotros en cuanto ML lo quitaba de destacados, y la
 * profundidad mediana del histórico se quedó en UN día.
 *
 * Esta pasada lee p1–p5 y NO filtra por calidad: al histórico le sirve
 * cualquier precio observado. Medido el 8-sep-2026, eso refresca ~137
 * productos ya seguidos en vez de ~40.
 *
 * ── LO QUE NO HACE ─────────────────────────────────────────────────────────
 * No toca ofertas.json. El feed del sitio sigue siendo la página 1 y sigue
 * decidiendo qué se muestra. Si esta pasada falla, la portada no se entera.
 *
 * Ejecutar:  npm run observar-precios
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descargarPagina, extraerAppProps } from '../utils/scrapeOfertas.js';
import { leerTarjeta } from '../utils/mlPayload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.resolve(__dirname, '../data/observaciones.json');

const PAGINAS = Number(process.env.PAGINAS_OBSERVACION) || 5;
/** Por debajo de esto algo se rompió: p1–p5 dieron 489 ids el 8-sep-2026. */
const MINIMO_ESPERADO = Number(process.env.MINIMO_OBSERVACIONES) || 150;
/** Pausa entre páginas: esto tiene que parecer alguien navegando. */
const PAUSA_MS = 1500;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`👁️  Observando precios en ${PAGINAS} páginas de ofertas…`);

  /** @type {Record<string, number>} */
  const precios = {};
  let paginasOk = 0;

  for (let p = 1; p <= PAGINAS; p++) {
    try {
      const items = extraerAppProps(await descargarPagina(p));
      let nuevos = 0;
      for (const item of items) {
        // Sin función de afiliado: aquí solo interesa el precio, no el enlace.
        const t = leerTarjeta(item);
        if (!t?.id || !Number.isFinite(t.precio_actual) || t.precio_actual <= 0) continue;
        // Si el mismo id sale en dos páginas, nos quedamos con el menor: la
        // entrada del día guarda min/max y el mínimo es el dato que importa.
        precios[t.id] = Math.min(precios[t.id] ?? Infinity, t.precio_actual);
        nuevos++;
      }
      paginasOk++;
      console.log(`   p${p}: ${nuevos} precios`);
    } catch (e) {
      // Una página menos es menos cobertura, no un dato corrupto. Se sigue.
      console.warn(`   ⚠️  p${p} falló: ${e.message}`);
    }
    if (p < PAGINAS) await espera(PAUSA_MS);
  }

  const total = Object.keys(precios).length;
  const sobre = { generadoEl: new Date().toISOString(), paginas: paginasOk, total, precios };
  await writeFile(SALIDA, JSON.stringify(sobre, null, 2), 'utf-8');
  console.log(`💾  observaciones.json: ${total} precios de ${paginasOk}/${PAGINAS} páginas.`);

  // La sonda. Fallar en silencio es lo que dejó el scraper 43 días muerto.
  if (total < MINIMO_ESPERADO) {
    console.error(`❌ Solo ${total} observaciones, esperadas ≥ ${MINIMO_ESPERADO}. ¿Cambió el HTML de ML?`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n✗ [observarPrecios] ${err.message}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Ignorar el archivo derivado**

En `.gitignore`, dentro del bloque `── DATOS DERIVADOS ──`, después de la línea `public/data/feed.json`, añadir:

```
src/data/observaciones.json
```

- [ ] **Step 3: Añadir el script de npm**

En `package.json`, en `scripts`, después de la línea de `"registrar-historico"`:

```json
"observar-precios": "node src/scripts/observarPrecios.js",
```

- [ ] **Step 4: Correrlo de verdad**

Run: `npm run observar-precios`
Expected: cinco líneas `p1: … p5: …`, luego `💾 observaciones.json: N precios de 5/5 páginas` con **N ≈ 240** (48 tarjetas legibles por página, páginas disjuntas). Salida 0.

Verificar la forma:

```bash
node -e "const o=require('./src/data/observaciones.json'); console.log(o.total, o.paginas, Object.entries(o.precios)[0])"
```

Expected: algo como `240 5 [ 'MLM123456789', 337.5 ]`

- [ ] **Step 5: Verificar que git lo ignora**

Run: `git status --short src/data/observaciones.json`
Expected: sin salida (el archivo está ignorado).

- [ ] **Step 6: Commit**

```bash
git add src/scripts/observarPrecios.js .gitignore package.json
git commit -m "feat: pasada profunda de precios sobre p1-p5, solo para el histórico"
```

---

### Task 3: El histórico lee las dos fuentes

**Files:**
- Modify: `src/scripts/registrarHistorico.js:31-60`

**Interfaces:**
- Consumes: `observaciones.json` de Task 2 (`{generadoEl, precios: Record<string, number>}`), y el `ofertas.json` existente (`{generadoEl, items: Array<{id, precio_actual}>}`).
- Produces: nada nuevo. Sigue escribiendo `historico-precios.json` con la misma forma.

**Por qué las dos y no solo la profunda:** el feed del sitio corre cada 3 h y esas observaciones ya están pagadas. Usar solo la pasada profunda perdería la granularidad intradía de los 40 destacados, que son justo los que la portada muestra. Se suman: profundidad de la pasada + frecuencia del feed.

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `src/utils/historico.test.js`:

```js
describe('registrarPrecio con volumen alto (pasada profunda)', () => {
  it('acumula 500 productos nuevos sin perder los previos', () => {
    let entradas = [['2026-09-07', 100, 100]];
    entradas = registrarPrecio(entradas, '2026-09-08', 90);
    expect(entradas).toHaveLength(2);
    expect(entradas[0]).toEqual(['2026-09-08', 90, 90]);
  });

  it('dos observaciones del mismo día se funden en min/max', () => {
    let e = registrarPrecio([], '2026-09-08', 120);
    e = registrarPrecio(e, '2026-09-08', 95);
    e = registrarPrecio(e, '2026-09-08', 130);
    expect(e).toHaveLength(1);
    expect(e[0]).toEqual(['2026-09-08', 95, 130]);
  });
});
```

- [ ] **Step 2: Correr el test**

Run: `npx vitest run src/utils/historico.test.js`
Expected: PASS — `registrarPrecio` ya soporta esto; el test fija el contrato del que Task 3 depende antes de tocar el script.

- [ ] **Step 3: Modificar registrarHistorico.js**

Sustituir el bloque de constantes y lectura (líneas ~31-58) por:

```js
const FEED = path.resolve(__dirname, '../data/ofertas.json');
const OBSERVACIONES = path.resolve(__dirname, '../data/observaciones.json');
const HISTORICO = path.resolve(__dirname, '../data/historico-precios.json');

const DIAS_HISTORIA = 90;
const DIAS_OLVIDO = 30;

function leerJson(ruta, porDefecto) {
  if (!existsSync(ruta)) return porDefecto;
  try {
    return JSON.parse(readFileSync(ruta, 'utf-8'));
  } catch {
    return porDefecto;
  }
}

// ── Las DOS fuentes ────────────────────────────────────────────────────────
// El feed del sitio (40 destacados, cada 3 h) da FRECUENCIA; la pasada
// profunda (p1-p5, 2 veces al día) da COBERTURA. Sumarlas cuesta cero: las
// observaciones del feed ya están pagadas.
const crudo = leerJson(FEED, null);
const ofertas = Array.isArray(crudo) ? crudo : (crudo?.items ?? []);
const observado = leerJson(OBSERVACIONES, null);
const precios = observado?.precios ?? {};

/** @type {Array<[string, number]>} pares [id, precio] de ambas fuentes */
const lecturas = [
  ...Object.entries(precios).map(([id, p]) => [id, Number(p)]),
  ...ofertas.map((o) => [o.id, Number(o.precio_actual)]),
].filter(([id, p]) => id && Number.isFinite(p) && p > 0);

if (lecturas.length === 0) {
  console.error('❌ [histórico] ni ofertas.json ni observaciones.json traen precios. No se registra nada.');
  process.exit(1);
}

// La fecha de la OBSERVACIÓN es la del dato, no la del reloj de quien ejecuta.
// Se toma el sello más reciente de las fuentes disponibles.
const sellos = [crudo?.generadoEl, observado?.generadoEl]
  .map((s) => Date.parse(s ?? ''))
  .filter((n) => !Number.isNaN(n));
const momento = sellos.length ? new Date(Math.max(...sellos)) : new Date();
const fecha = momento.toISOString().slice(0, 10);

const previo = leerJson(HISTORICO, { productos: {} });
```

Y sustituir **solo** el bucle de registro (el `for (const o of ofertas)`) por:

```js
const productos = { ...(previo.productos ?? {}) };

let nuevos = 0;
for (const [id, precio] of lecturas) {
  if (!productos[id]) nuevos++;
  productos[id] = registrarPrecio(productos[id], fecha, precio);
}
```

⚠️ **No tocar nada de lo que viene después del bucle.** Todo eso se queda tal
cual y es lo que impide que esta tarea rompa el proyecto:

- la llamada a `podar(...)` — sin ella el archivo crece sin techo, y con
  ~490 lecturas diarias en vez de 40 eso pasa de teórico a inmediato
- la comparación `anterior !== ahora` — es lo que evita que ocho corridas
  diarias generen ocho commits y ocho despliegues
- el `writeFileSync` condicionado a `cambio`

La variable `nuevos` se conserva porque la segunda línea del log la usa.

Ajustar solo la primera línea del log:

```js
console.log(`📈 [histórico] ${fecha}: ${lecturas.length} lecturas sobre ${Object.keys(productos).length} productos.`);
```

- [ ] **Step 4: Correrlo con las dos fuentes presentes**

Run: `npm run observar-precios && npm run registrar-historico`
Expected: `📈 [histórico] 2026-09-08: N lecturas sobre M productos` con **N ≈ 280** (240 de la pasada profunda + ~39 del feed) y **M > 598** (los previos más los nuevos de la paginación).

La mediana NO sube en esta corrida y no debe esperarse que lo haga: la profundidad se acumula por días, no por lecturas. Lo que sí sube hoy es el número de productos seguidos.

Comprobar que la mediana empieza a moverse:

```bash
node -e "const P=require('./src/data/historico-precios.json').productos; const d=Object.values(P).map(v=>v.length).sort((a,b)=>a-b); console.log('productos:',d.length,'| mediana:',d[Math.floor(d.length/2)],'| con 3+:',d.filter(x=>x>=3).length)"
```

- [ ] **Step 5: Correrlo SIN observaciones (el caso de degradación)**

Run: `rm src/data/observaciones.json && npm run registrar-historico`
Expected: no truena. Registra solo las ~40 del feed. Esto prueba que si la pasada profunda falla, el histórico sigue funcionando como antes.

- [ ] **Step 6: Correr toda la suite**

Run: `npx vitest run`
Expected: PASS, sin regresiones.

- [ ] **Step 7: Commit**

```bash
git add src/scripts/registrarHistorico.js src/utils/historico.test.js src/data/historico-precios.json
git commit -m "feat: el histórico suma la pasada profunda a las lecturas del feed"
```

---

### Task 4: El veredicto `descuento-falso`

**Files:**
- Modify: `src/utils/historico.js:25-105`
- Modify: `src/utils/historico.test.js`

**Interfaces:**
- Consumes: `resumirHistorico(entradas)` → `{dias, minimo, maximo, desde}` (sin cambios).
- Produces: `veredictoPrecio(precioActual, resumen, opciones?)` con un **tercer parámetro opcional** `{descuento?: number}`. Devuelve `{nivel, texto, dias, minimo}` donde `nivel` pasa a ser `'descuento-falso'|'minimo'|'bajo'|'alto'|'siguiendo'|'sin-datos'`. Exporta además `DIAS_DESCUENTO_FALSO = 14` y `DESCUENTO_SOSPECHOSO = 20`.

**Compatibilidad:** el tercer parámetro es opcional. Todas las llamadas existentes (`panel/hoy.astro:44`, `generarFeedPublico.js:72`) siguen compilando sin tocarlas; simplemente nunca obtienen el nivel nuevo hasta que se les pase el descuento en la Task 5.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `src/utils/historico.test.js`, dentro del bloque de `veredictoPrecio`:

```js
describe('veredictoPrecio — descuento falso', () => {
  /** Serie plana: el precio nunca se movió. */
  const plana = (n, precio) => serie(n, precio);

  it('acusa cuando hay descuento fuerte, historia larga y precio plano', () => {
    const v = veredictoPrecio(500, resumirHistorico(plana(20, 500)), { descuento: 46 });
    expect(v.nivel).toBe('descuento-falso');
    expect(v.texto).toMatch(/46/);
  });

  it('NO acusa por debajo del umbral de días, por plano que esté', () => {
    const v = veredictoPrecio(500, resumirHistorico(plana(10, 500)), { descuento: 46 });
    expect(v.nivel).not.toBe('descuento-falso');
  });

  it('NO acusa si el descuento anunciado es pequeño', () => {
    const v = veredictoPrecio(500, resumirHistorico(plana(20, 500)), { descuento: 5 });
    expect(v.nivel).not.toBe('descuento-falso');
  });

  it('NO acusa si el precio se movió alguna vez, por poco que sea', () => {
    const entradas = [...plana(19, 500), ['2026-07-01', 400, 400]];
    const v = veredictoPrecio(500, resumirHistorico(entradas), { descuento: 46 });
    expect(v.nivel).not.toBe('descuento-falso');
  });

  it('sin descuento declarado se comporta como antes (compatibilidad)', () => {
    const v = veredictoPrecio(500, resumirHistorico(plana(20, 500)));
    expect(v.nivel).toBe('minimo');
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/utils/historico.test.js -t "descuento falso"`
Expected: FAIL — el primero da `'minimo'` en vez de `'descuento-falso'`.

- [ ] **Step 3: Implementar**

En `src/utils/historico.js`, después de `const MARGEN_BAJO = 0.10;` añadir:

```js
/**
 * Días de observación exigidos para AFIRMAR que un descuento es falso.
 * Muy por encima de DIAS_MINIMOS (3) a propósito: este veredicto acusa a un
 * vendedor de publicidad engañosa, y con cinco días de datos eso sería
 * irresponsable. Un falso positivo daña más la credibilidad del sitio de lo
 * que un veredicto extra la construye.
 */
export const DIAS_DESCUENTO_FALSO = 14;

/** Descuento anunciado a partir del cual la afirmación merece comprobarse. */
export const DESCUENTO_SOSPECHOSO = 20;

/** Cuánto puede oscilar el precio y seguir considerándose «plano». */
const MARGEN_PLANO = 0.02;
```

Sustituir la firma y el cuerpo de `veredictoPrecio` (el bloque de `const ventana` hacia abajo) por:

```js
export function veredictoPrecio(precioActual, resumen, { descuento = 0 } = {}) {
  const p = Number(precioActual) || 0;
  const r = resumen ?? { dias: 0, minimo: null, maximo: null };

  if (!p || !r.dias || r.minimo === null) {
    return { nivel: 'sin-datos', texto: '', dias: 0, minimo: null };
  }

  if (r.dias < DIAS_MINIMOS) {
    return {
      nivel: 'siguiendo',
      texto: r.dias === 1 ? 'Seguimos su precio desde hoy' : `Seguimos su precio desde hace ${r.dias} días`,
      dias: r.dias,
      minimo: r.minimo,
    };
  }

  const ventana = `${r.dias} ${r.dias === 1 ? 'día' : 'días'}`;

  // ── El veredicto que es la marca ────────────────────────────────────────
  // Anuncia un descuentazo y su precio no se ha movido nunca. Va PRIMERO
  // porque un precio plano también cumple «está en su mínimo», y decir «el más
  // bajo en 20 días» de un precio que jamás cambió es técnicamente cierto y
  // engañoso: sugiere una bajada que no existe.
  const d = Number(descuento) || 0;
  const plano = Number.isFinite(r.maximo) && r.maximo <= r.minimo * (1 + MARGEN_PLANO);
  if (d >= DESCUENTO_SOSPECHOSO && r.dias >= DIAS_DESCUENTO_FALSO && plano) {
    return {
      nivel: 'descuento-falso',
      texto: `Anuncia −${d} % y su precio no ha bajado en ${ventana}`,
      dias: r.dias,
      minimo: r.minimo,
    };
  }

  if (p <= r.minimo * (1 + MARGEN_MINIMO)) {
    return { nivel: 'minimo', texto: `El precio más bajo en ${ventana}`, dias: r.dias, minimo: r.minimo };
  }

  if (p <= r.minimo * (1 + MARGEN_BAJO)) {
    return { nivel: 'bajo', texto: `Cerca de su mínimo de ${ventana}`, dias: r.dias, minimo: r.minimo };
  }

  // El caso que da credibilidad: decir que NO es buen momento.
  // (Antes había debajo una rama 'normal' INALCANZABLE: las tres condiciones
  //  anteriores cubren todos los reales. Se eliminó, no se ejecutaba nunca.)
  return {
    nivel: 'alto',
    texto: `Ha estado a ${fmt(r.minimo)} en ${ventana}`,
    dias: r.dias,
    minimo: r.minimo,
  };
}
```

Actualizar el JSDoc de `@returns` para que diga:

```js
 * @param {{descuento?: number}} [opciones] — descuento anunciado, en % entero
 * @returns {{nivel: 'descuento-falso'|'minimo'|'bajo'|'alto'|'siguiendo'|'sin-datos', texto: string, dias: number, minimo: number|null}}
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run src/utils/historico.test.js`
Expected: PASS, incluidos los 5 nuevos y todos los previos.

- [ ] **Step 5: Correr la suite entera**

Run: `npx vitest run`
Expected: PASS. Si algún test esperaba `nivel: 'normal'`, no debería existir — era código muerto. Si aparece uno, es que el test afirmaba algo imposible: bórralo y anótalo en el commit.

- [ ] **Step 6: Commit**

```bash
git add src/utils/historico.js src/utils/historico.test.js
git commit -m "feat: el veredicto del descuento falso, y fuera la rama 'normal' que era inalcanzable"
```

---

### Task 5: Mostrar el veredicto

**Files:**
- Modify: `src/pages/panel/hoy.astro:44,84`
- Modify: `src/scripts/generarFeedPublico.js:16,72`
- Modify: `src/components/TarjetaOferta.astro:535`

**Interfaces:**
- Consumes: `veredictoPrecio(precio, resumen, {descuento})` de Task 4.
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: Pasar el descuento en el panel**

En `src/pages/panel/hoy.astro`, línea 44:

```js
const v = veredictoPrecio(o.precio_actual, resumirHistorico(productosHist[o.id]), { descuento: o.descuento });
```

Y en la línea 84, incluir el nivel nuevo entre los que NO se publican:

```js
// Un descuento que es mentira no se reparte: repartirlo es prestarle nuestra
// credibilidad a la mentira.
const noPublicar = items.filter((i) => i.nivel === 'alto' || i.nivel === 'descuento-falso');
```

- [ ] **Step 2: Pasar el descuento en el feed público**

En `src/scripts/generarFeedPublico.js`, línea 72:

```js
const v = veredictoPrecio(o.precio_actual, resumen, { descuento: o.descuento });
```

Y actualizar el comentario de la línea 16:

```js
 *     historico.nivel = 'descuento-falso' | 'minimo' | 'bajo' | 'alto' | 'siguiendo' | 'sin-datos'
```

⚠️ **Y la línea 115, que es la que importa de verdad.** Hoy calcula los
publicables como `nivel !== 'alto'`, así que un `descuento-falso` contaría como
publicable y se repartiría por Telegram — el sitio anunciando fuera justo
aquello de lo que desconfía. Cambiar a:

```js
// Ni los que han estado más baratos ni los que anuncian un descuento que no
// existe. Repartir un descuento falso es prestarle nuestra credibilidad.
const NO_PUBLICABLES = new Set(['alto', 'descuento-falso']);
const publicables = items.filter((i) => !NO_PUBLICABLES.has(i.historico.nivel)).length;
```

Y ajustar el texto del `console.log` de la línea 119 para que nombre las dos
razones, no solo los «alto».

- [ ] **Step 3: Estilo en la tarjeta**

En `src/components/TarjetaOferta.astro`, junto a las reglas de las líneas 535-537.
El token es `--color-error` (`#ff5d76`), que ya existe en `src/styles/global.css:62`.
No inventes tokens nuevos: la paleta está cerrada.

```css
  /* El descuento falso va en rojo, un escalón por encima del ámbar de 'alto'.
     'alto' dice «no es buen momento»; esto dice «lo que te están diciendo no
     es verdad». Son cosas distintas y no deben verse igual. */
  .oferta-historial[data-nivel='descuento-falso'] {
    color: var(--color-error);
    font-weight: 600;
  }
```

Contexto de las reglas que ya están ahí, para que quede coherente:

```css
  .oferta-historial[data-nivel='minimo'] { color: var(--color-primary); font-weight: 600; }
  .oferta-historial[data-nivel='bajo'] { color: var(--color-primary); }
  .oferta-historial[data-nivel='alto'] { color: var(--color-warm, #e8a33d); }
```

- [ ] **Step 4: Verificar que construye**

Run: `npm run build`
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/pages/panel/hoy.astro src/scripts/generarFeedPublico.js src/components/TarjetaOferta.astro
git commit -m "feat: el descuento falso se muestra, y no se reparte"
```

---

### Task 6: La pasada profunda en el workflow

**Files:**
- Modify: `.github/workflows/actualizar-ofertas.yml:80-90`

**Interfaces:**
- Consumes: `npm run observar-precios` de Task 2.
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: Añadir el paso antes del histórico**

En `.github/workflows/actualizar-ofertas.yml`, **antes** del paso `- name: Registrar el histórico de precios` (línea ~80), insertar:

```yaml
      # ── Pasada profunda: solo dos veces al día ──────────────────────────
      # El histórico acumula por DÍA (min/max), así que correr esto en las 8
      # pasadas diarias gastaría 8× las peticiones para el mismo dato. Dos
      # veces sí aporta: con una sola, el min y el max del día serían siempre
      # el mismo número y se perdería el movimiento intradía.
      #
      # `continue-on-error` a propósito: si ML no responde, se registra lo que
      # haya del feed. Una cobertura menor no debe tumbar la corrida.
      - name: Observar precios en profundidad (p1-p5)
        if: github.event_name == 'workflow_dispatch' || fromJSON(steps.hora.outputs.h) == 6 || fromJSON(steps.hora.outputs.h) == 18
        continue-on-error: true
        run: npm run observar-precios
```

Y **antes** de ese paso, el que calcula la hora:

```yaml
      - name: ¿Toca pasada profunda?
        id: hora
        run: echo "h=$(date -u +%H | sed 's/^0//')" >> "$GITHUB_OUTPUT"
```

**Nota sobre `sed 's/^0//'`:** sin él, `08` se interpretaría como octal inválido en la comparación. El `sed` quita UN cero inicial, así que `08`→`8`, `18`→`18` y `00`→`0`. Nunca produce cadena vacía, y `fromJSON("0")` vale 0: la condición se evalúa sin error a cualquier hora.

- [ ] **Step 2: Validar la sintaxis del workflow**

Run: `npx --yes @action-validator/cli@latest .github/workflows/actualizar-ofertas.yml` (si falla la instalación, revisar a ojo la indentación: los pasos van a 6 espacios).
Expected: sin errores de sintaxis.

- [ ] **Step 3: Probar el disparo manual**

```bash
git add .github/workflows/actualizar-ofertas.yml
git commit -m "ci: la pasada profunda corre dos veces al día, sin tumbar la corrida si falla"
git push
gh workflow run actualizar-ofertas.yml
```

- [ ] **Step 4: Verificar la corrida**

```bash
gh run watch "$(gh run list --workflow=actualizar-ofertas.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

Expected: verde. En el log del paso «Observar precios» debe verse `💾 observaciones.json: N precios de 5/5 páginas` con N ≈ 240 (el `workflow_dispatch` fuerza la pasada sin esperar a las 6 o las 18).

---

## Verificación final

- [ ] `npx vitest run` — toda la suite en verde
- [ ] `npm run build` — construye
- [ ] La mediana de profundidad, medida hoy y anotada para comparar a 30 días:

```bash
node -e "const P=require('./src/data/historico-precios.json').productos; const d=Object.values(P).map(v=>v.length).sort((a,b)=>a-b); console.log('productos:',d.length,'| mediana:',d[Math.floor(d.length/2)],'| con 3+:',d.filter(x=>x>=3).length,'('+Math.round(d.filter(x=>x>=3).length/d.length*100)+'%)')"
```

**El criterio de éxito no es que esto pase hoy.** Es que a 30 días la mediana suba de 1 día a 7 o más, y los productos con 3+ días del 32 % a más del 60 %. Si no sube, el diseño falló y hay que volver al spec, no añadir páginas.
