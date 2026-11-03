/**
 * alertas — «Avísame cuando baje»: los precios que puede usar el backend y el
 * precio que se le sugiere a quien crea una alerta.
 *
 * ── CÓMO SE CONECTA ────────────────────────────────────────────────────────
 * El backend (backend/alertas.js) no lee la vitrina: lee /data/precios.json,
 * que sale de catalogoAlertas() en cada build. Lleva los productos que tienen
 * página y que seguimos (vigentes y vencidos; los retirados no) y, por cada
 * uno, hasta cuándo su precio cuenta como «de hoy».
 *
 * ── LA REGLA ───────────────────────────────────────────────────────────────
 * Una alerta solo se dispara con un precio VIGENTE: visto en los últimos 7
 * días (o una relámpago que no ha terminado). Nunca con un precio que nadie
 * revisó, aunque sea más bajo: avisar «bajó» con un dato viejo sería mentir.
 *
 * Funciones PURAS: sin disco, sin red, sin reloj propio.
 */
import { paginasDeVitrina } from './paginaProducto.js';
import { DIAS_VIGENCIA_PRECIO } from './vitrina.js';

const DIA = 86_400_000;

/** Versión de /data/precios.json. Súbela si cambia o desaparece un campo. */
export const ESQUEMA_PRECIOS = 1;

/**
 * Los productos sobre los que se puede crear (y disparar) una alerta.
 *
 * @param {any} crudo — vitrina.json ya parseado
 * @param {number} [ahora]
 * @returns {{
 *   id: string, slug: string, titulo: string, imagen: string|null,
 *   precio: number, visto: string, vigente_hasta: string,
 *   relampago: boolean, termina: string|null, enlace: string,
 * }[]}
 */
export function catalogoAlertas(crudo, ahora = Date.now()) {
  return paginasDeVitrina(crudo, ahora)
    .filter((pagina) => pagina.estado !== 'retirado')
    .map(({ producto: p }) => {
      const porRevision = Date.parse(p.revisado) + DIAS_VIGENCIA_PRECIO * DIA;
      const porRelampago = p.oferta_relampago && p.caduca ? Date.parse(p.caduca) : Infinity;
      return {
        id: p.id,
        slug: p.slug,
        titulo: p.titulo,
        imagen: p.imagen ?? null,
        precio: p.precio_actual,
        visto: p.revisado,
        vigente_hasta: new Date(Math.min(porRevision, porRelampago)).toISOString(),
        relampago: Boolean(p.oferta_relampago),
        termina: p.fin_oferta ?? null,
        // El link OFICIAL tal cual se pegó en la vitrina: el correo de «¡Bajó!»
        // lo lleva sin tocarlo.
        enlace: p.link_afiliado,
      };
    });
}

/** Redondea hacia abajo a un número «de etiqueta»: 225 → 220, 1349 → 1300. */
function redondoHaciaAbajo(n) {
  const paso = n < 100 ? 1 : n < 1000 ? 10 : n < 10_000 ? 50 : 100;
  return Math.floor(n / paso) * paso;
}

/**
 * El precio que se le propone a quien crea una alerta.
 *
 * Si el histórico ya lo vio más barato, se propone ese mínimo: es un precio
 * que existió, no uno inventado. Si no, un 10 % menos, redondeado.
 *
 * @param {number} precio — el último precio que vimos
 * @param {number|null} [minimo] — el más bajo del histórico, si lo hay
 * @returns {{objetivo: number, razon: 'minimo'|'menos-10'} | null}
 */
export function sugerirObjetivo(precio, minimo = null) {
  if (!(precio > 1)) return null;
  if (typeof minimo === 'number' && minimo >= 1 && minimo < precio * 0.99) {
    return { objetivo: Math.floor(minimo), razon: 'minimo' };
  }
  const objetivo = Math.max(1, redondoHaciaAbajo(precio * 0.9));
  return objetivo < precio ? { objetivo, razon: 'menos-10' } : null;
}
