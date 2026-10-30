/**
 * buenFin — Las fechas del Buen Fin, para /buen-fin y el enlace de temporada
 * del menú.
 *
 * Edición 2026: del viernes 13 al martes 17 de noviembre (fechas oficiales,
 * ver elbuenfin.org). Cada año hay que cambiarlas aquí y en ningún otro lado.
 *
 * Este módulo no lee disco: lo importa el Header, que va en todas las páginas.
 */
export const BUEN_FIN = Object.freeze({ edicion: 2026, inicio: '2026-11-13', fin: '2026-11-17' });

const DIA = 86_400_000;

/** Con cuánta anticipación aparece el enlace en el menú. */
const DIAS_ANTES = 30;

/**
 * ¿Va el enlace en el menú? Desde un mes antes hasta el día después del
 * cierre. El sitio se reconstruye a diario, así que se quita solo.
 *
 * @param {number} [ahora]
 */
export function enTemporada(ahora = Date.now()) {
  const inicio = Date.parse(`${BUEN_FIN.inicio}T00:00:00-06:00`);
  const fin = Date.parse(`${BUEN_FIN.fin}T23:59:59-06:00`);
  return ahora >= inicio - DIAS_ANTES * DIA && ahora <= fin + DIA;
}
