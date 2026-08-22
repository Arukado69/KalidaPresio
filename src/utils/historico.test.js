/**
 * Tests del histórico de precios.
 *
 * Lo que se protege aquí no es un cálculo: es una PROMESA. «El precio más bajo
 * en 30 días» es la frase que empuja a alguien a comprar, así que es también
 * la mentira más cara que este sitio podría contar. Estos tests fijan que solo
 * se afirme lo observado, y que con poca historia se diga cuánta hay en vez de
 * insinuar un rango que no existe.
 */
import { describe, it, expect } from 'vitest';
import {
  resumirHistorico,
  veredictoPrecio,
  registrarPrecio,
  podar,
  DIAS_MINIMOS,
} from './historico.js';

/** Genera `n` días consecutivos hacia atrás con un precio fijo. */
const serie = (n, precio, desde = '2026-08-20') => {
  const base = Date.parse(desde);
  return Array.from({ length: n }, (_, i) => [
    new Date(base - i * 86_400_000).toISOString().slice(0, 10),
    precio,
    precio,
  ]);
};

describe('resumirHistorico', () => {
  it('saca mínimo, máximo y días observados', () => {
    const r = resumirHistorico([
      ['2026-08-20', 300, 350],
      ['2026-08-19', 280, 320],
      ['2026-08-18', 400, 400],
    ]);
    expect(r).toEqual({ dias: 3, minimo: 280, maximo: 400, desde: '2026-08-18' });
  });

  it('ignora entradas corruptas en vez de tronar', () => {
    const r = resumirHistorico([['2026-08-20', 300, 350], null, ['x'], ['2026-08-19', 0, 0], 42]);
    expect(r.dias).toBe(1);
    expect(r.minimo).toBe(300);
  });

  it('sin historial, todo en cero/null', () => {
    for (const malo of [null, undefined, [], 'no', {}]) {
      expect(resumirHistorico(malo)).toEqual({ dias: 0, minimo: null, maximo: null, desde: null });
    }
  });
});

describe('veredictoPrecio — solo se afirma lo observado', () => {
  it('con menos de 3 días NO habla del rango: dice cuánto lleva mirándolo', () => {
    // Esta es LA regla. Con dos días no existe «el más bajo del mes».
    const v = veredictoPrecio(297, resumirHistorico(serie(2, 400)));
    expect(v.nivel).toBe('siguiendo');
    expect(v.texto).toContain('2 días');
    expect(v.texto).not.toMatch(/más bajo|mínimo/i);
  });

  it('el primer día lo dice en singular y sin prometer nada', () => {
    const v = veredictoPrecio(297, resumirHistorico(serie(1, 297)));
    expect(v.nivel).toBe('siguiendo');
    expect(v.texto).toBe('Seguimos su precio desde hoy');
  });

  it('nunca dice «histórico» ni «siempre»: la ventana va SIEMPRE en el texto', () => {
    for (const dias of [3, 10, 45, 90]) {
      const v = veredictoPrecio(100, resumirHistorico(serie(dias, 100)));
      expect(v.texto).toContain(`${dias} días`);
      expect(v.texto).not.toMatch(/hist[oó]ric|siempre|nunca|jam[aá]s/i);
    }
  });

  it('marca el mínimo cuando el precio actual lo iguala', () => {
    const h = [...serie(5, 400), ['2026-08-15', 297, 297]];
    const v = veredictoPrecio(297, resumirHistorico(h));
    expect(v.nivel).toBe('minimo');
    expect(v.texto).toMatch(/más bajo en 6 días/);
  });

  it('tolera centavos: 2 % de margen sigue contando como mínimo', () => {
    const h = serie(5, 300);
    expect(veredictoPrecio(305, resumirHistorico(h)).nivel).toBe('minimo');
  });

  it('avisa cuando el producto ha estado MÁS BARATO — eso es lo que da credibilidad', () => {
    const h = [...serie(5, 500), ['2026-08-15', 249, 249]];
    const v = veredictoPrecio(499, resumirHistorico(h));
    expect(v.nivel).toBe('alto');
    expect(v.texto).toContain('$249');
    expect(v.minimo).toBe(249);
  });

  it('«cerca del mínimo» para lo que está a un 10 % o menos', () => {
    const h = serie(5, 300);
    expect(veredictoPrecio(320, resumirHistorico(h)).nivel).toBe('bajo');
  });

  it('sin historial o sin precio, no dice nada (texto vacío)', () => {
    expect(veredictoPrecio(297, resumirHistorico([])).nivel).toBe('sin-datos');
    expect(veredictoPrecio(297, resumirHistorico([])).texto).toBe('');
    expect(veredictoPrecio(0, resumirHistorico(serie(10, 300))).nivel).toBe('sin-datos');
    expect(veredictoPrecio(297, null).nivel).toBe('sin-datos');
  });

  it('DIAS_MINIMOS es el umbral real, no un número suelto en el texto', () => {
    expect(veredictoPrecio(100, resumirHistorico(serie(DIAS_MINIMOS - 1, 100))).nivel).toBe('siguiendo');
    expect(veredictoPrecio(100, resumirHistorico(serie(DIAS_MINIMOS, 100))).nivel).not.toBe('siguiendo');
  });
});

describe('registrarPrecio — acumula por día, no por corrida', () => {
  it('la primera observación del día crea la entrada', () => {
    expect(registrarPrecio([], '2026-08-20', 300)).toEqual([['2026-08-20', 300, 300]]);
  });

  it('ocho pasadas el mismo día NO crean ocho entradas', () => {
    // Es lo que evita ocho commits y ocho redespliegues diarios.
    let h = [];
    for (const p of [300, 280, 310, 295, 300, 305, 290, 300]) h = registrarPrecio(h, '2026-08-20', p);
    expect(h).toHaveLength(1);
    expect(h[0]).toEqual(['2026-08-20', 280, 310]);
  });

  it('días distintos sí son entradas distintas, ordenadas de nueva a vieja', () => {
    let h = registrarPrecio([], '2026-08-18', 300);
    h = registrarPrecio(h, '2026-08-20', 250);
    h = registrarPrecio(h, '2026-08-19', 400);
    expect(h.map((e) => e[0])).toEqual(['2026-08-20', '2026-08-19', '2026-08-18']);
  });

  it('un precio inválido no ensucia el historial', () => {
    const h = [['2026-08-20', 300, 300]];
    for (const malo of [0, -5, NaN, null, undefined, 'gratis']) {
      expect(registrarPrecio(h, '2026-08-21', malo)).toEqual(h);
    }
  });
});

describe('podar — el archivo no puede crecer para siempre', () => {
  const hoy = new Date('2026-08-20T12:00:00Z');

  it('tira las entradas más viejas que la ventana', () => {
    const r = podar({ A: [['2026-08-20', 1, 1], ['2026-01-01', 9, 9]] }, { dias: 90, hoy });
    expect(r.A).toHaveLength(1);
  });

  it('olvida productos que llevan tiempo fuera del catálogo', () => {
    const r = podar(
      { vivo: [['2026-08-20', 1, 1]], viejo: [['2026-07-01', 1, 1]] },
      { dias: 90, diasOlvido: 30, hoy },
    );
    expect(Object.keys(r)).toEqual(['vivo']);
  });

  it('no deja productos con el historial vacío', () => {
    const r = podar({ A: [['2020-01-01', 1, 1]] }, { dias: 90, hoy });
    expect(r).toEqual({});
  });

  it('no truena con entradas basura', () => {
    expect(() => podar({ A: [null, 'x', ['2026-08-20', 1, 1]] }, { hoy })).not.toThrow();
    expect(podar(null, { hoy })).toEqual({});
  });
});
