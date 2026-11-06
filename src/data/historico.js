/**
 * historico — Acceso al historial de precios en build-time.
 *
 * Se lee con readFileSync y no con `import ... from './x.json'` a propósito:
 * si el archivo aún no existe (repo recién clonado, primera corrida del bot),
 * un import estático rompería el build entero. Aquí simplemente no hay
 * historial y las tarjetas no enseñan insignia — que es exactamente lo que
 * debe pasar cuando no se ha observado nada todavía.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { entradasDelProducto, resumirHistorico, veredictoPrecio } from '../utils/historico.js';

function cargar() {
  const candidatos = [
    path.resolve(process.cwd(), 'src/data/historico-precios.json'),
    new URL('./historico-precios.json', import.meta.url),
  ];
  for (const ruta of candidatos) {
    try {
      const datos = JSON.parse(readFileSync(ruta, 'utf-8'));
      if (datos?.productos && typeof datos.productos === 'object') return datos;
    } catch { /* siguiente candidato */ }
  }
  return null;
}

const datos = cargar();

/** Nº de productos con historial. 0 = todavía no se ha observado nada. */
export const PRODUCTOS_SEGUIDOS = datos ? Object.keys(datos.productos).length : 0;

if (!datos) {
  console.warn('⚠ [histórico] Sin historial de precios todavía. Las tarjetas saldrán sin insignia.');
} else {
  const conBase = Object.values(datos.productos).filter((e) => e.length >= 3).length;
  console.log(`📈 [histórico] ${PRODUCTOS_SEGUIDOS} productos seguidos · ${conBase} con base suficiente para afirmar algo.`);
}

/**
 * El historial de un producto de la vitrina: el del bot más el que tú juntaste
 * al compartirlo o guardarlo (`vistos`). Es el que usan las tarjetas y su
 * página: los productos que llegan desde la app no tienen id de Mercado Libre,
 * así que sin `vistos` nunca tendrían historia.
 * @param {object} producto — normalizado (src/utils/vitrina.js)
 * @returns {Array<[string, number, number]>} más reciente primero
 */
export function entradasDeProducto(producto) {
  return entradasDelProducto(datos?.productos, producto);
}

/**
 * Qué se puede decir del precio de HOY de un producto de la vitrina.
 * @param {object} producto — normalizado (src/utils/vitrina.js)
 * @returns {ReturnType<typeof veredictoPrecio>}
 */
export function veredictoDeProducto(producto) {
  return veredictoPrecio(producto?.precio_actual, resumirHistorico(entradasDeProducto(producto)), { descuento: producto?.descuento });
}
