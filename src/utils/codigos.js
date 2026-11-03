/**
 * codigos — El código fijo de cada producto: «K-17».
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────────
 * /hoy numeraba por posición (#1, #2…). Un TikTok sigue teniendo vistas
 * semanas después, y en cuanto cambiaba la vitrina «el #3 de mi perfil»
 * apuntaba a otro producto. El código se asigna UNA vez, cuando el producto
 * entra a la vitrina, y no cambia ni se reusa nunca: tampoco al retirarlo (su
 * página sigue en línea y /k/17 sigue llevando a ella) ni al borrarlo del
 * todo (por eso la vitrina guarda `ultimo_codigo`).
 *
 * ── QUIÉN LO ASIGNA ────────────────────────────────────────────────────────
 * El panel (/panel/agregar), cada vez que guarda el borrador. El build NO
 * inventa códigos: uno que no está escrito en vitrina.json cambiaría con el
 * siguiente build, que es justo el problema que esto resuelve.
 *
 * Funciones PURAS: no modifican lo que reciben.
 */

export const PREFIJO = 'K';

/** 17, «17», «K-17», «k17», «K 17» → 17. null si no es un código válido. */
export function normalizarCodigo(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= 99_999 ? v : null;
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(?:k[\s-]?)?(\d{1,5})$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 ? n : null;
}

/** 17 → «K-17». null si no hay código. */
export function formatoCodigo(v) {
  const n = normalizarCodigo(v);
  return n ? `${PREFIJO}-${n}` : null;
}

/** 17 → «k17», el ancla de /hoy (/hoy#k17). */
export function anclaCodigo(v) {
  const n = normalizarCodigo(v);
  return n ? `${PREFIJO.toLowerCase()}${n}` : null;
}

/**
 * El código que le toca al siguiente producto: uno más que el mayor que se
 * haya usado nunca (contando `ultimo_codigo`, que recuerda los borrados).
 *
 * @param {{productos?: object[], retirados?: object[], ultimo_codigo?: unknown}} vitrina
 */
export function siguienteCodigo({ productos = [], retirados = [], ultimo_codigo } = {}) {
  let mayor = normalizarCodigo(ultimo_codigo) ?? 0;
  for (const e of [...productos, ...retirados]) mayor = Math.max(mayor, normalizarCodigo(e?.codigo) ?? 0);
  return mayor + 1;
}

/**
 * Pone código a quien no lo tiene y resuelve los repetidos (el primero se
 * queda con el suyo: activos antes que retirados, en el orden de la lista).
 * Devuelve copias; las entradas que ya estaban bien salen idénticas.
 *
 * @param {{productos?: object[], retirados?: object[], ultimo_codigo?: unknown}} vitrina
 * @returns {{productos: object[], retirados: object[], ultimo_codigo: number, asignados: number}}
 */
export function asignarCodigos({ productos = [], retirados = [], ultimo_codigo } = {}) {
  const usados = new Set();
  const marcar = (e) => {
    const n = normalizarCodigo(e?.codigo);
    if (n && !usados.has(n)) {
      usados.add(n);
      return true;
    }
    return false;
  };
  const conCodigo = [...productos, ...retirados].map(marcar);

  let siguiente = siguienteCodigo({ productos, retirados, ultimo_codigo });
  let asignados = 0;
  const arreglar = (e, i) => {
    if (conCodigo[i]) return normalizarCodigo(e.codigo) === e.codigo ? e : { ...e, codigo: normalizarCodigo(e.codigo) };
    asignados++;
    return { ...e, codigo: siguiente++ };
  };

  const nuevosProductos = productos.map((e, i) => arreglar(e, i));
  const nuevosRetirados = retirados.map((e, i) => arreglar(e, productos.length + i));
  return {
    productos: nuevosProductos,
    retirados: nuevosRetirados,
    ultimo_codigo: siguiente - 1,
    asignados,
  };
}
