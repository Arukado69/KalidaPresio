/**
 * ofertas — Punto ÚNICO de acceso al feed de producción.
 *
 * `ofertas.json` nació como un array pelón y ahora lo escribe `importarOfertas.js`
 * como sobre con sello de fecha: `{ generadoEl, fuente, total, items }`.
 * Este módulo acepta las dos formas, así que:
 *
 *   · el sitio sigue construyendo con el ofertas.json viejo que hay en el repo,
 *     hasta que el bot de 3 h escriba el primero con sobre;
 *   · nadie más tiene que preocuparse por la forma del archivo.
 *
 * Por qué importa el sello: sin él no hay manera de saber CUÁNDO se detectaron
 * esos precios. El pie del sitio acababa mostrando `new Date()` —la fecha del
 * build— como si fuera la de los datos, y cualquier despliegue de código
 * rejuvenecía unos precios que no habían cambiado.
 */
import crudo from './ofertas.json';

const esArray = Array.isArray(crudo);

/** Las ofertas, siempre como array. */
export const OFERTAS = esArray ? crudo : (Array.isArray(crudo?.items) ? crudo.items : []);

/**
 * Cuándo se detectaron estos precios (ISO 8601), o null si el archivo es del
 * formato antiguo. `null` significa «no lo sabemos», y el sitio lo dice tal
 * cual en vez de inventarse una fecha.
 */
export const GENERADO_EL = esArray ? null : (crudo?.generadoEl ?? null);

export default OFERTAS;
