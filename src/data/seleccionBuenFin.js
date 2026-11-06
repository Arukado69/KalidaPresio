/**
 * seleccionBuenFin — Los productos de la vitrina en /buen-fin, en build-time.
 *
 * Antes del Buen Fin: los precios de referencia (lo que vimos y cuándo).
 * Desde el día 13: si bajaron de verdad, siguen igual o subieron, contra lo
 * que se vio en los 30 días antes (src/utils/vitrinaBuenFin.js).
 *
 * Usa todas las páginas de producto menos las retiradas: un precio que se
 * venció después del Buen Fin no borra lo que se vio durante el Buen Fin.
 * El sitio se reconstruye a diario y con cada publicación del panel, así que
 * la fase cambia sola.
 */
import crudo from './vitrina.json';
import { BUEN_FIN } from './buenFin.js';
import { paginasDeVitrina } from '../utils/paginaProducto.js';
import { faseBuenFin, resumenBuenFin } from '../utils/vitrinaBuenFin.js';
import { fechaDeRevision } from '../utils/vistos.js';

/** Hoy, en la Ciudad de México ('YYYY-MM-DD'). */
export const HOY_MX = fechaDeRevision(new Date().toISOString());

/** 'antes' | 'durante' | 'despues' */
export const FASE = faseBuenFin(HOY_MX, BUEN_FIN);

const paginas = paginasDeVitrina(crudo).filter((x) => x.estado !== 'retirado');

/** Lo que se publica hoy, con su precio vigente: los precios de referencia. */
export const VIGENTES = paginas.filter((x) => x.estado === 'vigente').map((x) => x.producto);

/** Antes del Buen Fin contra el Buen Fin, producto por producto. */
export const RESUMEN = resumenBuenFin(paginas.map((x) => x.producto), BUEN_FIN);

/** La revisión más reciente de lo que se publica (ISO), o null. */
export const ULTIMA_REVISION = VIGENTES.reduce((max, p) => (!max || p.revisado > max ? p.revisado : max), null);
