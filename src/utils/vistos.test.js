/**
 * Tests del historial propio (src/utils/vistos.js).
 *
 * Lo que se protege: que el día sea el de México (lo que viste a las 8 de la
 * noche del 5 no puede salir como «el 6»), que el primer cambio de precio no
 * borre el precio anterior, y que una entrada rota en vitrina.json no tumbe
 * nada.
 */
import { describe, it, expect } from 'vitest';
import { fechaDeRevision, vistosValidos, anotarVisto, MAX_VISTOS } from './vistos.js';

describe('fechaDeRevision', () => {
  it('usa el día de la Ciudad de México, no el de UTC', () => {
    // 5 nov a las 20:30 en México = 6 nov 02:30 UTC.
    expect(fechaDeRevision('2026-11-06T02:30:00.000Z')).toBe('2026-11-05');
    expect(fechaDeRevision('2026-11-05T18:00:00.000Z')).toBe('2026-11-05');
  });

  it('una fecha ilegible no es un día', () => {
    expect(fechaDeRevision('ayer')).toBeNull();
    expect(fechaDeRevision(undefined)).toBeNull();
    expect(fechaDeRevision(12345)).toBeNull();
  });
});

describe('vistosValidos', () => {
  it('descarta lo roto, funde días repetidos y ordena del más reciente al más viejo', () => {
    const r = vistosValidos([
      ['2026-11-01', 100, 100],
      ['nov 2', 90, 90],
      ['2026-11-03', 0, 0],
      ['2026-11-04', 120, 110],
      ['2026-11-05', 95, 95],
      ['2026-11-01', 98, 104],
      'basura',
    ]);
    expect(r).toEqual([['2026-11-05', 95, 95], ['2026-11-01', 98, 104]]);
  });

  it('copia las entradas: no toca el arreglo del producto', () => {
    const original = [['2026-11-01', 100, 100]];
    vistosValidos(original)[0][1] = 1;
    expect(original[0][1]).toBe(100);
  });

  it(`guarda solo los ${MAX_VISTOS} días más recientes`, () => {
    const muchos = Array.from({ length: MAX_VISTOS + 10 }, (_, k) => {
      const d = new Date(Date.UTC(2026, 0, 1 + k)).toISOString().slice(0, 10);
      return [d, 100 + k, 100 + k];
    });
    const r = vistosValidos(muchos);
    expect(r).toHaveLength(MAX_VISTOS);
    expect(r[0][0]).toBe(muchos.at(-1)[0]);
  });

  it('sin arreglo → vacío', () => {
    expect(vistosValidos(null)).toEqual([]);
    expect(vistosValidos({})).toEqual([]);
  });
});

describe('anotarVisto', () => {
  it('un producto nuevo empieza con lo que viste hoy', () => {
    expect(anotarVisto(null, 99.59, '2026-11-05T18:00:00Z')).toEqual([['2026-11-05', 99.59, 99.59]]);
  });

  it('el primer cambio de precio rescata el precio anterior (de antes de que existiera el historial)', () => {
    const antes = { precio: 1299, revisado: '2026-11-05T18:00:00Z' };
    expect(anotarVisto(antes, 1199, '2026-11-13T17:00:00Z')).toEqual([
      ['2026-11-13', 1199, 1199],
      ['2026-11-05', 1299, 1299],
    ]);
  });

  it('el mismo día se funde en mínimo y máximo', () => {
    const antes = { vistos: [['2026-11-05', 1299, 1299]], precio: 1299, revisado: '2026-11-05T15:00:00Z' };
    expect(anotarVisto(antes, 1249, '2026-11-05T20:00:00Z')).toEqual([['2026-11-05', 1249, 1299]]);
  });

  it('no modifica el producto que recibe', () => {
    const antes = { vistos: [['2026-11-05', 1299, 1299]] };
    anotarVisto(antes, 1000, '2026-11-05T20:00:00Z');
    expect(antes.vistos).toEqual([['2026-11-05', 1299, 1299]]);
  });

  it('sin precio o sin fecha no anota nada nuevo', () => {
    const antes = { vistos: [['2026-11-05', 1299, 1299]] };
    expect(anotarVisto(antes, null, '2026-11-06T18:00:00Z')).toEqual([['2026-11-05', 1299, 1299]]);
    expect(anotarVisto(antes, 1000, 'cuando sea')).toEqual([['2026-11-05', 1299, 1299]]);
  });
});
