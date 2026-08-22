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
import { resumirHistorico, veredictoPrecio } from '../utils/historico.js';

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
 * Qué se puede decir del precio de este producto, hoy.
 * @param {string} id — id de Mercado Libre
 * @param {number} precioActual
 * @returns {ReturnType<typeof veredictoPrecio>}
 */
export function veredictoDe(id, precioActual) {
  const entradas = datos?.productos?.[id];
  return veredictoPrecio(precioActual, resumirHistorico(entradas));
}
