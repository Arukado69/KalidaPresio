/**
 * Tests del Detector del Buen Fin.
 *
 * Lo que se protege: que la página pública nunca acuse a un producto con
 * menos evidencia de la que exige el histórico, que no le ponga veredicto a
 * un precio que ya nadie vio, y que encuentre la historia de un producto
 * aunque esté repartida entre su id de artículo y su id de catálogo.
 */
import { describe, it, expect } from 'vitest';
import {
  fichaDeTarjeta,
  fusionarCatalogo,
  estadoObservacion,
  detectar,
  DIAS_FICHA,
  DIAS_EN_OFERTA,
} from './detector.js';
import { DIAS_DESCUENTO_FALSO, DESCUENTO_SOSPECHOSO } from './historico.js';

const HOY = '2026-11-14';

/** `n` días consecutivos hasta `hasta` (incluido), con el precio dado. */
const serie = (n, min, max = min, hasta = HOY) => {
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => [new Date(fin - i * 86_400_000).toISOString().slice(0, 10), min, max]);
};

const ficha = (extra = {}) => ({
  titulo: 'Freidora de aire 5 L',
  url: 'https://www.mercadolibre.com.mx/freidora/p/MLM50000001',
  imagen: 'https://http2.mlstatic.com/x.webp',
  precio: 999,
  precio_antes: 1999,
  descuento: 50,
  visto: HOY,
  ...extra,
});

describe('fichaDeTarjeta', () => {
  it('toma de la tarjeta lo que la página necesita', () => {
    const t = { id: 'MLM1932698151', titulo: 'Freidora', url_producto: 'https://x.mx/p/MLM1', imagen: 'i.webp', precio_actual: 999, precio_previo: 1999, descuento: 50.4 };
    expect(fichaDeTarjeta(t)).toEqual({ titulo: 'Freidora', url: 'https://x.mx/p/MLM1', imagen: 'i.webp', precio: 999, precio_antes: 1999, descuento: 50 });
  });

  it('sin id, título, URL o precio no hay ficha', () => {
    expect(fichaDeTarjeta({ id: 'MLM1', titulo: 'x', url_producto: 'u', precio_actual: 0 })).toBeNull();
    expect(fichaDeTarjeta({ titulo: 'x', url_producto: 'u', precio_actual: 9 })).toBeNull();
    expect(fichaDeTarjeta(null)).toBeNull();
  });
});

describe('fusionarCatalogo — una ficha por artículo, y solo las recientes', () => {
  it('la ficha de hoy gana y lleva la fecha de la observación', () => {
    const previo = { A: ficha({ precio: 1200, visto: '2026-11-12' }) };
    const r = fusionarCatalogo(previo, { A: { ...ficha({ precio: 999 }), visto: undefined } }, HOY);
    expect(r.A.precio).toBe(999);
    expect(r.A.visto).toBe(HOY);
  });

  it(`poda lo que lleva más de ${DIAS_FICHA} días sin verse`, () => {
    const previo = { viejo: ficha({ visto: '2026-11-06' }), justo: ficha({ visto: '2026-11-07' }) };
    expect(Object.keys(fusionarCatalogo(previo, {}, HOY))).toEqual(['justo']);
  });

  it('una ficha incompleta no entra, y la basura no truena', () => {
    expect(fusionarCatalogo(null, { A: { titulo: 'x' }, B: null }, HOY)).toEqual({});
  });
});

describe('estadoObservacion — cuánto llevamos mirando', () => {
  it('cuenta días distintos, no entradas', () => {
    const r = estadoObservacion({ A: serie(3, 10), B: serie(5, 20) });
    expect(r).toEqual({ dias: 5, desde: '2026-11-10', hasta: HOY });
  });

  it('sin historial, cero y nulos', () => {
    expect(estadoObservacion(null)).toEqual({ dias: 0, desde: null, hasta: null });
  });
});

describe('detectar — el veredicto que se publica', () => {
  it('acusa descuento falso solo con la historia y el descuento que exige el histórico', () => {
    const historico = { MLM50000001: serie(DIAS_DESCUENTO_FALSO, 999) };
    const r = detectar({ catalogo: { MLM1932698151: ficha() }, historico, hoy: HOY });
    expect(r.falsos).toHaveLength(1);
    expect(r.falsos[0].texto).toBe(`Anuncia −50 % y su precio no ha bajado en ${DIAS_DESCUENTO_FALSO} días`);
  });

  it('con un día menos de historia NO acusa', () => {
    const historico = { MLM50000001: serie(DIAS_DESCUENTO_FALSO - 1, 999) };
    const r = detectar({ catalogo: { MLM1932698151: ficha() }, historico, hoy: HOY });
    expect(r.falsos).toEqual([]);
  });

  it(`con un descuento anunciado menor a ${DESCUENTO_SOSPECHOSO} % NO acusa`, () => {
    const historico = { MLM50000001: serie(30, 999) };
    const r = detectar({ catalogo: { MLM1932698151: ficha({ descuento: DESCUENTO_SOSPECHOSO - 1 }) }, historico, hoy: HOY });
    expect(r.falsos).toEqual([]);
  });

  it('encuentra la historia aunque esté guardada por id de artículo', () => {
    const historico = { MLM1932698151: serie(20, 999) };
    const r = detectar({ catalogo: { MLM1932698151: ficha() }, historico, hoy: HOY });
    expect(r.falsos.map((x) => x.id)).toEqual(['MLM1932698151']);
    expect(r.falsos[0].claves).toEqual(['MLM1932698151', 'MLM50000001']);
  });

  it('«ha estado más barato» cuando lo vimos a un precio menor', () => {
    const historico = { MLM50000001: [...serie(5, 999), ['2026-11-01', 700, 700]] };
    const r = detectar({ catalogo: { A: ficha() }, historico, hoy: HOY });
    expect(r.inflados).toHaveLength(1);
    expect(r.inflados[0].texto).toMatch(/Ha estado a \$700/);
  });

  it('«precio real bajo» cuando bajó de verdad hasta su mínimo', () => {
    const historico = { MLM50000001: [['2026-11-14', 999, 999], ...serie(10, 1500, 1500, '2026-11-13')] };
    const r = detectar({ catalogo: { A: ficha() }, historico, hoy: HOY });
    expect(r.reales.map((x) => x.nivel)).toEqual(['minimo']);
  });

  it(`no le pone veredicto a una ficha de hace más de ${DIAS_EN_OFERTA} días: ese precio ya nadie lo vio`, () => {
    const historico = { MLM50000001: serie(30, 999) };
    const r = detectar({ catalogo: { A: ficha({ visto: '2026-11-10' }) }, historico, hoy: HOY });
    expect(r.enOferta).toBe(0);
    expect(r.falsos).toEqual([]);
  });

  it('sin historia suficiente, el producto se cuenta como «siguiendo» y no sale en ninguna lista', () => {
    const r = detectar({ catalogo: { A: ficha() }, historico: {}, hoy: HOY });
    expect(r).toMatchObject({ falsos: [], inflados: [], reales: [], siguiendo: 1, enOferta: 1 });
  });

  it('ordena por el descuento anunciado más grande', () => {
    const historico = {
      MLM50000001: serie(20, 999),
      MLM50000002: serie(20, 500),
    };
    const catalogo = {
      A: ficha({ descuento: 30 }),
      B: ficha({ url: 'https://www.mercadolibre.com.mx/x/p/MLM50000002', precio: 500, descuento: 60 }),
    };
    expect(detectar({ catalogo, historico, hoy: HOY }).falsos.map((x) => x.id)).toEqual(['B', 'A']);
  });

  it('la URL que se publica va limpia, sin parámetros', () => {
    const historico = { MLM50000001: serie(20, 999) };
    const r = detectar({ catalogo: { A: ficha({ url: 'https://www.mercadolibre.com.mx/freidora/p/MLM50000001?tracking=1#x' }) }, historico, hoy: HOY });
    expect(r.falsos[0].url).toBe('https://www.mercadolibre.com.mx/freidora/p/MLM50000001');
  });
});
