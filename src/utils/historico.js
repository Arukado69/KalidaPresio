/**
 * historico — Qué se puede AFIRMAR sobre un precio a partir de lo observado.
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────────
 * El bot toma una foto de precios cada 3 h y hasta ahora las tiraba todas.
 * Guardarlas convierte «$297» en «$297 — el más bajo en 30 días», que es la
 * única frase capaz de mover a alguien de "ya lo pensaré" a comprar hoy. Y es
 * lo único del sitio que un competidor no puede copiar el día que lo vea:
 * necesita el historial, y el historial solo se consigue esperando.
 *
 * ── LA REGLA QUE MANDA ─────────────────────────────────────────────────────
 * Solo se afirma lo observado. Con tres días de datos NO se dice «el más bajo
 * del mes»; se dice cuántos días llevamos mirando, o no se dice nada. El
 * proyecto ya se quitó de encima un aggregateRating inventado y unas fichas de
 * ejemplo: un mínimo histórico falso sería la misma mentira con otro traje, y
 * además la más cara, porque es la que empuja a comprar.
 *
 * Y va en las dos direcciones: si el producto ha estado más barato, se dice.
 * Avisar de que NO es buen momento es lo que hace creíble el resto.
 *
 * Funciones PURAS: se les pasa el historial y el instante. Sin disco, sin DOM.
 */

/** Días mínimos de observación para afirmar algo sobre el rango de precios. */
export const DIAS_MINIMOS = 3;

/** A partir de aquí el precio actual se considera «en su mínimo». */
const MARGEN_MINIMO = 0.02;  // 2 %: absorbe centavos y redondeos de ML
/** Umbral para «cerca del mínimo». */
const MARGEN_BAJO = 0.10;

const fmt = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n) || 0);

/**
 * Resume las entradas de un producto.
 *
 * @param {Array<[string, number, number]>} entradas — [fechaISO, min, max], en cualquier orden
 * @returns {{dias: number, minimo: number|null, maximo: number|null, desde: string|null}}
 */
export function resumirHistorico(entradas) {
  const validas = (Array.isArray(entradas) ? entradas : []).filter(
    (e) => Array.isArray(e) && typeof e[0] === 'string' && Number.isFinite(e[1]) && Number.isFinite(e[2]) && e[1] > 0,
  );
  if (validas.length === 0) return { dias: 0, minimo: null, maximo: null, desde: null };

  let minimo = Infinity;
  let maximo = 0;
  let desde = validas[0][0];
  for (const [fecha, min, max] of validas) {
    if (min < minimo) minimo = min;
    if (max > maximo) maximo = max;
    if (fecha < desde) desde = fecha;
  }
  return { dias: validas.length, minimo, maximo, desde };
}

/**
 * Traduce «precio actual + historial» a algo que se le pueda decir al usuario.
 *
 * @param {number} precioActual
 * @param {ReturnType<typeof resumirHistorico>} resumen
 * @returns {{nivel: 'minimo'|'bajo'|'normal'|'alto'|'siguiendo'|'sin-datos', texto: string, dias: number, minimo: number|null}}
 */
export function veredictoPrecio(precioActual, resumen) {
  const p = Number(precioActual) || 0;
  const r = resumen ?? { dias: 0, minimo: null, maximo: null };

  if (!p || !r.dias || r.minimo === null) {
    return { nivel: 'sin-datos', texto: '', dias: 0, minimo: null };
  }

  // Aún no hay base para hablar del rango: se dice lo único cierto, que
  // llevamos poco mirándolo. Nunca se insinúa una historia que no existe.
  if (r.dias < DIAS_MINIMOS) {
    return {
      nivel: 'siguiendo',
      texto: r.dias === 1 ? 'Seguimos su precio desde hoy' : `Seguimos su precio desde hace ${r.dias} días`,
      dias: r.dias,
      minimo: r.minimo,
    };
  }

  const ventana = `${r.dias} ${r.dias === 1 ? 'día' : 'días'}`;

  if (p <= r.minimo * (1 + MARGEN_MINIMO)) {
    return { nivel: 'minimo', texto: `El precio más bajo en ${ventana}`, dias: r.dias, minimo: r.minimo };
  }

  if (p <= r.minimo * (1 + MARGEN_BAJO)) {
    return { nivel: 'bajo', texto: `Cerca de su mínimo de ${ventana}`, dias: r.dias, minimo: r.minimo };
  }

  // El caso que da credibilidad: decir que NO es buen momento.
  if (p > r.minimo * (1 + MARGEN_BAJO)) {
    return {
      nivel: 'alto',
      texto: `Ha estado a ${fmt(r.minimo)} en ${ventana}`,
      dias: r.dias,
      minimo: r.minimo,
    };
  }

  return { nivel: 'normal', texto: `Precio habitual de los últimos ${ventana}`, dias: r.dias, minimo: r.minimo };
}

/**
 * Mezcla la observación de hoy en el historial de un producto.
 * Un mismo día se acumula en min/max en vez de añadir una entrada nueva: así
 * el archivo crece por DÍA y no por corrida, y ocho pasadas diarias con el
 * mismo precio no generan ocho commits.
 *
 * @param {Array<[string, number, number]>} entradas — historial previo
 * @param {string} fecha — 'YYYY-MM-DD'
 * @param {number} precio
 * @returns {Array<[string, number, number]>} historial nuevo (más reciente primero)
 */
export function registrarPrecio(entradas, fecha, precio) {
  const p = Number(precio);
  if (!Number.isFinite(p) || p <= 0) return Array.isArray(entradas) ? entradas : [];

  const previas = (Array.isArray(entradas) ? entradas : []).filter(
    (e) => Array.isArray(e) && typeof e[0] === 'string' && Number.isFinite(e[1]) && Number.isFinite(e[2]),
  );
  const hoy = previas.find((e) => e[0] === fecha);

  if (hoy) {
    hoy[1] = Math.min(hoy[1], p);
    hoy[2] = Math.max(hoy[2], p);
  } else {
    previas.push([fecha, p, p]);
  }

  return previas.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
}

/**
 * Descarta lo que ya no aporta: entradas más viejas que `dias` y productos que
 * llevan `diasOlvido` sin aparecer en el feed. Sin esto el archivo crece para
 * siempre y acaba pesando más que el repositorio entero.
 *
 * @param {Record<string, Array<[string, number, number]>>} productos
 * @param {{dias?: number, diasOlvido?: number, hoy?: Date}} [opciones]
 */
export function podar(productos, { dias = 90, diasOlvido = 30, hoy = new Date() } = {}) {
  const corte = new Date(hoy.getTime() - dias * 86_400_000).toISOString().slice(0, 10);
  const corteOlvido = new Date(hoy.getTime() - diasOlvido * 86_400_000).toISOString().slice(0, 10);

  const salida = {};
  for (const [id, entradas] of Object.entries(productos ?? {})) {
    const vivas = (entradas ?? []).filter((e) => Array.isArray(e) && e[0] >= corte);
    if (vivas.length === 0) continue;
    // El producto salió del catálogo hace tiempo: su historial ya no se va a
    // enseñar en ningún sitio.
    if (vivas[0][0] < corteOlvido) continue;
    salida[id] = vivas;
  }
  return salida;
}
