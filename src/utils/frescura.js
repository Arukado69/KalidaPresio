/**
 * frescura — Cuándo se detectaron estos precios, dicho en voz alta.
 *
 * El pie del sitio siempre ha sido honesto en la letra («los precios son una
 * referencia del momento en que se detectaron»), pero esa frase no se podía
 * comprobar: no había fecha por ningún lado, y la que se mostraba era la del
 * build, así que cualquier despliegue de código rejuvenecía unos precios que
 * no habían cambiado.
 *
 * Esto convierte una advertencia defensiva en una afirmación verificable.
 * La regla es no esconder nunca la edad real: si el feed lleva tres días
 * parado, el sitio lo dice. Un dato viejo señalado es información útil; un
 * dato viejo disfrazado de fresco es lo que quema la confianza.
 *
 * Función PURA: mismo instante + misma marca → mismo texto. Sin DOM.
 */

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** Umbrales de tono. Coinciden con el TTL de src/data/secciones.js. */
export const HORAS_FRESCO = 6;
export const HORAS_RECIENTE = 24;

/** Formato absoluto es-MX, para el `title` y para quien no tenga JS. */
function absoluto(fecha) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(fecha);
}

/** «hace 2 horas», «hace 3 días»… Sin adornos ni redondeos optimistas. */
function relativo(ms) {
  // Reloj adelantado o marca del futuro: no inventamos un negativo raro.
  if (ms < 0) return 'hace un momento';
  if (ms < MINUTO) return 'hace un momento';
  if (ms < HORA) {
    const m = Math.floor(ms / MINUTO);
    return m === 1 ? 'hace 1 minuto' : `hace ${m} minutos`;
  }
  if (ms < DIA) {
    const h = Math.floor(ms / HORA);
    return h === 1 ? 'hace 1 hora' : `hace ${h} horas`;
  }
  const d = Math.floor(ms / DIA);
  if (d === 1) return 'hace 1 día';
  // Sin tope: «hace 43 días» informa mucho más que «hace más de una semana»,
  // y cuando el número asusta es justo cuando hay que verlo.
  return `hace ${d} días`;
}

/**
 * Describe la frescura de una marca de tiempo.
 *
 * @param {string|null|undefined} iso — marca ISO 8601, o null si no se conoce.
 * @param {number} [ahora] — instante de referencia (inyectable para tests).
 * @returns {{nivel: 'fresco'|'reciente'|'viejo'|'desconocido', texto: string, absoluto: string|null, iso: string|null, horas: number|null}}
 */
export function describirFrescura(iso, ahora = Date.now()) {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;

  if (Number.isNaN(t)) {
    // Sin fecha no se finge una: se admite que no se sabe.
    return { nivel: 'desconocido', texto: 'sin fecha de detección', absoluto: null, iso: null, horas: null };
  }

  const ms = ahora - t;
  const horas = ms / HORA;
  const nivel = horas < HORAS_FRESCO ? 'fresco'
    : horas < HORAS_RECIENTE ? 'reciente'
    : 'viejo';

  return {
    nivel,
    texto: relativo(ms),
    absoluto: absoluto(new Date(t)),
    iso: new Date(t).toISOString(),
    horas,
  };
}

/**
 * La frase completa que ve el usuario. Se separa del cálculo para que el
 * copy se pueda ajustar sin tocar la lógica (ni sus tests).
 *
 * @param {ReturnType<typeof describirFrescura>} f
 * @returns {string}
 */
export function fraseFrescura(f) {
  if (f.nivel === 'desconocido') return 'Precios sin fecha de detección — verifícalos en Mercado Libre.';
  if (f.nivel === 'viejo') return `Precios detectados ${f.texto} — pueden haber cambiado.`;
  return `Precios detectados ${f.texto}`;
}
