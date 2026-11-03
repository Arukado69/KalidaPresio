/**
 * Tests de los códigos fijos («K-17»).
 *
 * Lo que se protege: que un código NUNCA cambie ni se reuse (ni al retirar, ni
 * al borrar del todo un producto), que no haya dos productos con el mismo, y
 * que se acepte como la gente lo escribe.
 */
import { describe, it, expect } from 'vitest';
import { normalizarCodigo, formatoCodigo, anclaCodigo, siguienteCodigo, asignarCodigos } from './codigos.js';

describe('normalizarCodigo / formatoCodigo', () => {
  it('acepta el código como lo escribe la gente', () => {
    for (const v of [17, '17', 'K-17', 'k17', 'K 17', ' k-17 ']) expect(normalizarCodigo(v)).toBe(17);
  });

  it('rechaza lo que no es un código', () => {
    for (const v of [0, -3, 1.5, '', 'K-', 'K-0', 'X-17', '17a', null, undefined, {}]) expect(normalizarCodigo(v)).toBeNull();
  });

  it('se muestra como «K-17» y su ancla es «k17»', () => {
    expect(formatoCodigo(17)).toBe('K-17');
    expect(formatoCodigo('k3')).toBe('K-3');
    expect(formatoCodigo(null)).toBeNull();
    expect(anclaCodigo(17)).toBe('k17');
  });
});

describe('siguienteCodigo', () => {
  it('es uno más que el mayor, contando los retirados', () => {
    expect(siguienteCodigo({ productos: [{ codigo: 3 }], retirados: [{ codigo: 9 }] })).toBe(10);
  });

  it('recuerda los borrados del todo: ultimo_codigo no deja reusar', () => {
    expect(siguienteCodigo({ productos: [{ codigo: 3 }], ultimo_codigo: 12 })).toBe(13);
  });

  it('una vitrina vacía empieza en 1', () => {
    expect(siguienteCodigo({})).toBe(1);
  });
});

describe('asignarCodigos', () => {
  it('le pone código a quien no tiene, sin tocar a quien ya tiene', () => {
    const tenia = { titulo: 'A', codigo: 5 };
    const r = asignarCodigos({ productos: [{ titulo: 'Nuevo' }, tenia], retirados: [] });
    expect(r.productos[0]).toEqual({ titulo: 'Nuevo', codigo: 6 });
    expect(r.productos[1]).toBe(tenia); // la misma entrada, sin copiar
    expect(r).toMatchObject({ ultimo_codigo: 6, asignados: 1 });
  });

  it('no modifica lo que recibe', () => {
    const productos = [{ titulo: 'Nuevo' }];
    asignarCodigos({ productos });
    expect(productos[0]).toEqual({ titulo: 'Nuevo' });
  });

  it('un repetido: el primero se queda con el suyo y el otro recibe uno nuevo', () => {
    const r = asignarCodigos({ productos: [{ t: 'a', codigo: 4 }, { t: 'b', codigo: 4 }], retirados: [{ t: 'c', codigo: 4 }] });
    expect(r.productos.map((p) => p.codigo)).toEqual([4, 5]);
    expect(r.retirados[0].codigo).toBe(6);
  });

  it('el activo gana sobre el retirado si comparten código', () => {
    const r = asignarCodigos({ productos: [{ t: 'activo', codigo: 2 }], retirados: [{ t: 'viejo', codigo: 2 }] });
    expect(r.productos[0].codigo).toBe(2);
    expect(r.retirados[0].codigo).toBe(3);
  });

  it('nunca reusa el código de un producto borrado del todo', () => {
    // Había 1, 2 y 3; el 3 se borró del todo y la vitrina recuerda ultimo_codigo = 3.
    const r = asignarCodigos({ productos: [{ codigo: 1 }, { codigo: 2 }, { t: 'nuevo' }], ultimo_codigo: 3 });
    expect(r.productos[2].codigo).toBe(4);
  });

  it('un código escrito como texto se guarda como número', () => {
    const r = asignarCodigos({ productos: [{ codigo: 'K-7' }] });
    expect(r.productos[0].codigo).toBe(7);
    expect(r.asignados).toBe(0);
  });

  it('es estable: pasarla dos veces no cambia nada', () => {
    const una = asignarCodigos({ productos: [{ t: 'a' }, { t: 'b' }], retirados: [{ t: 'c' }] });
    const dos = asignarCodigos(una);
    expect(dos.productos).toEqual(una.productos);
    expect(dos.retirados).toEqual(una.retirados);
    expect(dos.asignados).toBe(0);
    expect(dos.ultimo_codigo).toBe(3);
  });
});
