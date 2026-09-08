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
 * Ante la duda, degradar: un veredicto de menos no cuesta nada; uno de más
 * cuesta la credibilidad entera.
 *
 * Funciones PURAS: se les pasa el historial y el instante. Sin disco, sin DOM.
 */

/** Días mínimos de observación para afirmar algo sobre el rango de precios. */
export const DIAS_MINIMOS = 3;

/** A partir de aquí el precio actual se considera «en su mínimo». */
const MARGEN_MINIMO = 0.02;  // 2 %: absorbe centavos y redondeos de ML
/** Umbral para «cerca del mínimo». */
const MARGEN_BAJO = 0.10;

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

/**
 * Nombre del nivel que el carrusel Relámpago excluye — y SOLO ese nivel: un
 * 'alto' sigue siendo un descuento real (el producto solo ha estado más
 * barato), así que no pertenece aquí. Fuente única de verdad del string: todo
 * consumidor que compare contra 'descuento-falso' debe importar esto en vez
 * de repetir el literal, para que un rename lo rompa en vez de dejarlo callado.
 */
export const NIVEL_DESCUENTO_FALSO = 'descuento-falso';

/**
 * Niveles que JAMÁS se reparten: el feed público y el panel de reparto manual
 * excluyen los DOS. No es lo mismo que NIVEL_DESCUENTO_FALSO — a propósito no
 * se colapsan — porque el carrusel sí distribuye 'alto' (descuento real
 * contra un precio que ya bajó antes) y solo el feed/panel también lo vetan
 * (ahí el criterio es más estricto: ni siquiera un descuento real pero contra
 * un precio inflado se anuncia). Congelado: nadie debe poder mutarlo en runtime.
 */
export const NIVELES_NO_DISTRIBUIBLES = Object.freeze(['alto', NIVEL_DESCUENTO_FALSO]);

/** Cuánto puede oscilar el precio y seguir considerándose «plano». */
const MARGEN_PLANO = 0.02;

/** Fracción de la ventana que debe estar observada para hablar de ella. */
const DENSIDAD_MINIMA = 0.7;

const fmt = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n) || 0);

/**
 * Días de CALENDARIO entre dos fechas 'YYYY-MM-DD', ambos extremos incluidos.
 * Un único día observado es 1 día, no 0.
 *
 * Ante cualquier duda —fecha ilegible, algo que no es texto, extremos al
 * revés— devuelve 0: sin ventana medible no hay nada que afirmar sobre el
 * tiempo transcurrido, y quien la use debe quedarse callado.
 *
 * Se exporta solo para poder testearla; no es parte de lo que el sitio consume.
 *
 * @param {string} desdeISO
 * @param {string} hastaISO
 * @returns {number}
 */
export function diasEntre(desdeISO, hastaISO) {
  if (typeof desdeISO !== 'string' || typeof hastaISO !== 'string') return 0;
  const a = Date.parse(`${desdeISO}T00:00:00Z`);
  const b = Date.parse(`${hastaISO}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Resume las entradas de un producto.
 *
 * `desde` y `hasta` son los extremos observados: con los dos se mide la ventana
 * de calendario, que NO es lo mismo que `dias` (cuántas veces miramos).
 *
 * @param {Array<[string, number, number]>} entradas — [fechaISO, min, max], en cualquier orden
 * @returns {{dias: number, minimo: number|null, maximo: number|null, desde: string|null, hasta: string|null}}
 */
export function resumirHistorico(entradas) {
  const validas = (Array.isArray(entradas) ? entradas : []).filter(
    (e) => Array.isArray(e) && typeof e[0] === 'string' && Number.isFinite(e[1]) && Number.isFinite(e[2]) && e[1] > 0,
  );
  if (validas.length === 0) return { dias: 0, minimo: null, maximo: null, desde: null, hasta: null };

  let minimo = Infinity;
  let maximo = 0;
  let desde = validas[0][0];
  let hasta = validas[0][0];
  for (const [fecha, min, max] of validas) {
    if (min < minimo) minimo = min;
    if (max > maximo) maximo = max;
    if (fecha < desde) desde = fecha;
    if (fecha > hasta) hasta = fecha;
  }
  return { dias: validas.length, minimo, maximo, desde, hasta };
}

/**
 * Traduce «precio actual + historial» a algo que se le pueda decir al usuario.
 *
 * @param {number} precioActual
 * @param {ReturnType<typeof resumirHistorico>} resumen
 * @param {{descuento?: number}|null} [opciones] — descuento anunciado, en % entero
 * @returns {{nivel: 'descuento-falso'|'minimo'|'bajo'|'alto'|'siguiendo'|'sin-datos', texto: string, dias: number, minimo: number|null}}
 */
export function veredictoPrecio(precioActual, resumen, opciones) {
  const p = Number(precioActual) || 0;
  const r = resumen ?? { dias: 0, minimo: null, maximo: null, desde: null, hasta: null };
  // Igual de tolerante que con `resumen`: el feed escribe `descuento: null`
  // cuando no hay descuento anunciado, y un default de parámetro solo cubre
  // `undefined`. Un null no puede tumbar la construcción del feed entero.
  const { descuento = 0 } = opciones ?? {};

  // La guarda mira el VALOR, no un centinela concreto: un undefined o un NaN
  // que se colaran aquí tienen que degradar igual que un null.
  if (!p || !r.dias || !Number.isFinite(r.minimo)) {
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

  const diasTexto = `${r.dias} ${r.dias === 1 ? 'día' : 'días'}`;

  // ── El veredicto que es la marca ────────────────────────────────────────
  // Anuncia un descuentazo y su precio no se ha movido nunca. Va PRIMERO
  // porque un precio plano también cumple «está en su mínimo», y decir «el más
  // bajo en 20 días» de un precio que jamás cambió es técnicamente cierto y
  // engañoso: sugiere una bajada que no existe.
  //
  // Pero este veredicto acusa por su nombre a un vendedor real de publicidad
  // engañosa. Las cuatro puertas de abajo no son adorno: cada una es un modo
  // conocido de acusar a un inocente.
  const d = Number(descuento);

  // Un rango imposible (máximo por debajo del mínimo) es dato roto, no un
  // precio quieto: resumirHistorico solo comprueba que el mínimo sea > 0, así
  // que una entrada corrupta puede dejar el máximo en cero. Se degrada.
  const rangoValido = Number.isFinite(r.maximo) && r.maximo >= r.minimo;
  const plano = rangoValido && r.maximo <= r.minimo * (1 + MARGEN_PLANO);

  // El precio de HOY tiene que estar dentro de la banda plana. Si está por
  // debajo, el descuento es real y hoy es justo el día en que bajó — el
  // histórico todavía no lo sabe porque se registra después del build.
  const sigueIgual = plano && p >= r.minimo * (1 - MARGEN_PLANO) && p <= r.maximo * (1 + MARGEN_PLANO);

  // «no ha bajado en N días» habla de tiempo transcurrido, no de cuántas veces
  // miramos. Sin densidad, quince fotos repartidas en cuarenta días mentirían:
  // podar deja pasar hasta 30 días sin ver un producto sin borrarlo.
  const ventana = diasEntre(r.desde, r.hasta);   // días de calendario, inclusive
  const densa = ventana >= DIAS_DESCUENTO_FALSO && r.dias >= ventana * DENSIDAD_MINIMA;

  // Un descuento imposible (Infinity, 250 %, negativo, ilegible) acabaría
  // impreso tal cual dentro de la acusación. Ante la duda, callar.
  const creible = Number.isFinite(d) && d >= DESCUENTO_SOSPECHOSO && d < 100;

  if (creible && densa && sigueIgual) {
    return {
      // Usa la constante exportada, no el literal: es la que importan los
      // consumidores (feed, panel, carrusel), y así el valor real que sale de
      // aquí no puede divergir silenciosamente de lo que ellos comparan.
      nivel: NIVEL_DESCUENTO_FALSO,
      texto: `Anuncia −${d} % y su precio no ha bajado en ${ventana} días`,
      dias: r.dias,
      minimo: r.minimo,
    };
  }

  if (p <= r.minimo * (1 + MARGEN_MINIMO)) {
    return { nivel: 'minimo', texto: `El precio más bajo en ${diasTexto}`, dias: r.dias, minimo: r.minimo };
  }

  if (p <= r.minimo * (1 + MARGEN_BAJO)) {
    return { nivel: 'bajo', texto: `Cerca de su mínimo de ${diasTexto}`, dias: r.dias, minimo: r.minimo };
  }

  // El caso que da credibilidad: decir que NO es buen momento.
  // (Antes había debajo una rama 'normal' INALCANZABLE: las tres condiciones
  //  anteriores cubren todos los reales. Se eliminó, no se ejecutaba nunca.)
  return {
    nivel: 'alto',
    texto: `Ha estado a ${fmt(r.minimo)} en ${diasTexto}`,
    dias: r.dias,
    minimo: r.minimo,
  };
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
