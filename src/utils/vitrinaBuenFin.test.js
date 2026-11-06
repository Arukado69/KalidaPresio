/**
 * Tests de «¿bajaron de verdad en el Buen Fin?» con la vitrina.
 *
 * Lo que se protege: que la referencia sea el precio MÁS BAJO de los 30 días
 * antes (no el último, que es el que se infla), que un 2 % no cuente como
 * rebaja, y que de un producto sin precio de antes o sin revisar en el Buen
 * Fin no se diga nada.
 */
import { describe, it, expect } from 'vitest';
import { faseBuenFin, compararConBuenFin, resumenBuenFin, DIAS_REFERENCIA } from './vitrinaBuenFin.js';

const BF = { inicio: '2026-11-13', fin: '2026-11-17' };
const p = (...vistos) => ({ vistos: vistos.map(([f, precio]) => [f, precio, precio]) });

describe('faseBuenFin', () => {
  it('antes, durante (los cinco días, inclusive) y después', () => {
    expect(faseBuenFin('2026-11-12', BF)).toBe('antes');
    expect(faseBuenFin('2026-11-13', BF)).toBe('durante');
    expect(faseBuenFin('2026-11-17', BF)).toBe('durante');
    expect(faseBuenFin('2026-11-18', BF)).toBe('despues');
  });
});

describe('compararConBuenFin', () => {
  it('bajó de verdad: más barato que todo lo que vimos antes', () => {
    const c = compararConBuenFin(p(['2026-11-14', 1199], ['2026-11-06', 1299]), BF);
    expect(c.estado).toBe('bajo');
    expect(c.antes).toEqual({ fecha: '2026-11-06', precio: 1299 });
    expect(c.durante).toEqual({ fecha: '2026-11-14', precio: 1199 });
    expect(c.cambio).toBeCloseTo(-0.077, 3);
  });

  it('EL TRUCO: subió antes del 13 para «bajar» en el Buen Fin → la referencia es el más bajo, no el último', () => {
    // 20 oct a $999, 10 nov a $1,399 (inflado), Buen Fin a $1,199: no bajó, subió.
    const c = compararConBuenFin(p(['2026-11-14', 1199], ['2026-11-10', 1399], ['2026-10-20', 999]), BF);
    expect(c.estado).toBe('subio');
    expect(c.antes).toEqual({ fecha: '2026-10-20', precio: 999 });
  });

  it('un 2 % no es rebaja: es el mismo precio', () => {
    expect(compararConBuenFin(p(['2026-11-13', 980], ['2026-11-05', 1000]), BF).estado).toBe('igual');
    expect(compararConBuenFin(p(['2026-11-13', 979], ['2026-11-05', 1000]), BF).estado).toBe('bajo');
    expect(compararConBuenFin(p(['2026-11-13', 1021], ['2026-11-05', 1000]), BF).estado).toBe('subio');
  });

  it('del Buen Fin cuenta el más bajo que le vimos esos días', () => {
    const c = compararConBuenFin(p(['2026-11-16', 1099], ['2026-11-13', 1199], ['2026-11-06', 1299]), BF);
    expect(c.durante).toEqual({ fecha: '2026-11-16', precio: 1099 });
  });

  it(`solo cuentan los ${DIAS_REFERENCIA} días antes del Buen Fin`, () => {
    // 13 oct ya queda fuera (31 días antes): sin precio de antes, no se compara.
    const c = compararConBuenFin(p(['2026-11-14', 1199], ['2026-10-13', 999]), BF);
    expect(c.estado).toBe('sin-referencia');
    expect(compararConBuenFin(p(['2026-11-14', 1199], ['2026-10-14', 999]), BF).estado).toBe('subio');
  });

  it('sin revisarlo en el Buen Fin no se dice nada; tampoco sin precio de antes', () => {
    expect(compararConBuenFin(p(['2026-11-06', 1299]), BF)).toMatchObject({ estado: 'sin-revisar', durante: null });
    expect(compararConBuenFin(p(['2026-11-14', 1199]), BF)).toMatchObject({ estado: 'sin-referencia', antes: null });
    expect(compararConBuenFin({}, BF).estado).toBe('sin-revisar');
  });

  it('lo visto después del Buen Fin no cuenta como precio del Buen Fin', () => {
    expect(compararConBuenFin(p(['2026-11-20', 899], ['2026-11-06', 1299]), BF).estado).toBe('sin-revisar');
  });
});

describe('resumenBuenFin', () => {
  it('agrupa, cuenta lo que no se puede comparar y ordena por el cambio', () => {
    const r = resumenBuenFin([
      p(['2026-11-14', 950], ['2026-11-06', 1000]),   // −5 %
      p(['2026-11-14', 800], ['2026-11-06', 1000]),   // −20 %
      p(['2026-11-14', 1000], ['2026-11-06', 1000]),  // igual
      p(['2026-11-14', 1100], ['2026-11-06', 1000]),  // +10 %
      p(['2026-11-14', 1500], ['2026-11-06', 1000]),  // +50 %
      p(['2026-11-06', 1000]),                        // sin revisar
      p(['2026-11-14', 1000]),                        // sin referencia
    ], BF);
    expect(r.bajaron.map((x) => Math.round(x.cambio * 100))).toEqual([-20, -5]);
    expect(r.iguales).toHaveLength(1);
    expect(r.subieron.map((x) => Math.round(x.cambio * 100))).toEqual([50, 10]);
    expect(r).toMatchObject({ sinRevisar: 1, sinReferencia: 1 });
  });

  it('sin productos, todo vacío', () => {
    expect(resumenBuenFin(null, BF)).toEqual({ bajaron: [], iguales: [], subieron: [], sinRevisar: 0, sinReferencia: 0 });
  });
});
