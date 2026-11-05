/**
 * pesos — Un precio como lo escribe Mercado Libre México: «$1,299», o con sus
 * centavos si los tiene: «$99.59».
 *
 * NUNCA redondea. Antes cada página formateaba sin decimales y una playera de
 * $99.59 salía como «$100»: un precio más alto que el real, en el sitio que
 * presume de precios honestos. Una sola función para todo el sitio, para que
 * no vuelva a pasar en una página y en otra no.
 *
 * @param {unknown} n
 * @returns {string}
 */
export function pesos(n) {
  const v = Number(n) || 0;
  const conCentavos = Math.round(Math.abs(v) * 100) % 100 !== 0;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: conCentavos ? 2 : 0,
    maximumFractionDigits: conCentavos ? 2 : 0,
  }).format(v);
}
