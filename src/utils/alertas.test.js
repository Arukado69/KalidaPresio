/**
 * Tests del catálogo de las alertas «avísame cuando baje».
 *
 * Lo que se protege: que el backend nunca reciba como «de hoy» un precio que
 * nadie revisó (la alerta se dispararía con un dato viejo), que los retirados
 * no se ofrezcan, que el link viaje tal cual y que el precio sugerido sea uno
 * que existió o un redondeo honesto, nunca uno más alto que el actual.
 */
import { describe, it, expect } from 'vitest';
import { catalogoAlertas, sugerirObjetivo } from './alertas.js';

const AHORA = Date.parse('2026-11-03T18:00:00Z');
const DIA = 86_400_000;

const entrada = (extra = {}) => ({
  link: 'https://meli.la/1AbCdE',
  titulo: 'Samsung Galaxy A16 128 GB',
  precio: 2389,
  precio_antes: 4949,
  revisado: new Date(AHORA - DIA).toISOString(),
  url_producto: 'https://www.mercadolibre.com.mx/samsung-galaxy-a16/p/MLM44113911',
  ...extra,
});

describe('catalogoAlertas — qué puede leer el backend', () => {
  it('un producto vigente lleva su precio, cuándo se vio y hasta cuándo cuenta', () => {
    const [p] = catalogoAlertas({ productos: [entrada()] }, AHORA);
    expect(p).toMatchObject({
      id: 'MLM44113911',
      titulo: 'Samsung Galaxy A16 128 GB',
      precio: 2389,
      visto: new Date(AHORA - DIA).toISOString(),
      relampago: false,
      termina: null,
    });
    // 7 días después de revisado.
    expect(Date.parse(p.vigente_hasta)).toBe(AHORA - DIA + 7 * DIA);
    expect(p.slug).toMatch(/-mlm44113911$/);
  });

  it('el link oficial viaja TAL CUAL, sin tocarlo', () => {
    const [p] = catalogoAlertas({ productos: [entrada({ link: '  https://meli.la/1AbCdE  ' })] }, AHORA);
    expect(p.enlace).toBe('https://meli.la/1AbCdE');
  });

  it('un precio vencido sigue en el catálogo (se puede crear la alerta) pero ya no cuenta como de hoy', () => {
    const [p] = catalogoAlertas({ productos: [entrada({ revisado: new Date(AHORA - 9 * DIA).toISOString() })] }, AHORA);
    expect(Date.parse(p.vigente_hasta)).toBeLessThan(AHORA);
  });

  it('una relámpago cuenta solo hasta que termina', () => {
    const termina = new Date(AHORA + 3 * 3_600_000).toISOString();
    const [p] = catalogoAlertas({ productos: [entrada({ relampago: true, termina })] }, AHORA);
    expect(p).toMatchObject({ relampago: true, termina, vigente_hasta: termina });
  });

  it('los retirados no están: ya no los seguimos', () => {
    const retirado = entrada({ link: 'https://meli.la/2XyZ', url_producto: 'https://www.mercadolibre.com.mx/plancha/p/MLM10000010', retirado: new Date(AHORA).toISOString() });
    const lista = catalogoAlertas({ productos: [entrada()], retirados: [retirado] }, AHORA);
    expect(lista.map((p) => p.id)).toEqual(['MLM44113911']);
  });

  it('un borrador sin link oficial no está: no tiene página ni link que mandar', () => {
    expect(catalogoAlertas({ productos: [entrada({ link: '' })] }, AHORA)).toEqual([]);
  });
});

describe('sugerirObjetivo — el precio que se propone', () => {
  it('si el histórico ya lo vio más barato, propone ese mínimo', () => {
    expect(sugerirObjetivo(1499, 1399)).toEqual({ objetivo: 1399, razon: 'minimo' });
  });

  it('sin un mínimo más bajo, propone 10 % menos, redondeado hacia abajo', () => {
    expect(sugerirObjetivo(1499)).toEqual({ objetivo: 1300, razon: 'menos-10' });
    expect(sugerirObjetivo(251)).toEqual({ objetivo: 220, razon: 'menos-10' });
    expect(sugerirObjetivo(89)).toEqual({ objetivo: 80, razon: 'menos-10' });
    expect(sugerirObjetivo(23_999)).toEqual({ objetivo: 21_500, razon: 'menos-10' });
  });

  it('un mínimo igual al precio de hoy no cuenta como «más barato»', () => {
    expect(sugerirObjetivo(1499, 1499).razon).toBe('menos-10');
  });

  it('nunca propone algo igual o más alto que el precio actual', () => {
    for (const precio of [2, 5, 10, 99, 101, 999, 1001, 10_001]) {
      const s = sugerirObjetivo(precio);
      if (s) expect(s.objetivo).toBeLessThan(precio);
    }
  });

  it('sin precio no sugiere nada', () => {
    expect(sugerirObjetivo(0)).toBeNull();
    expect(sugerirObjetivo(Number.NaN)).toBeNull();
  });
});
