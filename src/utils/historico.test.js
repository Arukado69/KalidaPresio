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
  DIAS_DESCUENTO_FALSO,
  DESCUENTO_SOSPECHOSO,
  diasEntre,
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
    expect(r).toEqual({ dias: 3, minimo: 280, maximo: 400, desde: '2026-08-18', hasta: '2026-08-20' });
  });

  it('ignora entradas corruptas en vez de tronar', () => {
    const r = resumirHistorico([['2026-08-20', 300, 350], null, ['x'], ['2026-08-19', 0, 0], 42]);
    expect(r.dias).toBe(1);
    expect(r.minimo).toBe(300);
  });

  it('sin historial, todo en cero/null', () => {
    for (const malo of [null, undefined, [], 'no', {}]) {
      expect(resumirHistorico(malo)).toEqual({ dias: 0, minimo: null, maximo: null, desde: null, hasta: null });
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

describe('veredictoPrecio — descuento falso', () => {
  /** Serie plana: el precio nunca se movió. */
  const plana = (n, precio) => serie(n, precio);

  it('acusa cuando hay descuento fuerte, historia larga y precio plano', () => {
    const v = veredictoPrecio(500, resumirHistorico(plana(20, 500)), { descuento: 46 });
    expect(v.nivel).toBe('descuento-falso');
    expect(v.texto).toMatch(/46/);
  });

  it('NO acusa por debajo del umbral de días, por plano que esté', () => {
    const v = veredictoPrecio(500, resumirHistorico(plana(10, 500)), { descuento: 46 });
    expect(v.nivel).not.toBe('descuento-falso');
  });

  it('NO acusa si el descuento anunciado es pequeño', () => {
    const v = veredictoPrecio(500, resumirHistorico(plana(20, 500)), { descuento: 5 });
    expect(v.nivel).not.toBe('descuento-falso');
  });

  it('NO acusa si el precio se movió alguna vez, por poco que sea', () => {
    const entradas = [...plana(19, 500), ['2026-07-01', 400, 400]];
    const v = veredictoPrecio(500, resumirHistorico(entradas), { descuento: 46 });
    expect(v.nivel).not.toBe('descuento-falso');
  });

  it('sin descuento declarado se comporta como antes (compatibilidad)', () => {
    const v = veredictoPrecio(500, resumirHistorico(plana(20, 500)));
    expect(v.nivel).toBe('minimo');
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

describe('registrarPrecio con volumen alto (pasada profunda)', () => {
  it('acumula 500 productos nuevos sin perder los previos', () => {
    let entradas = [['2026-09-07', 100, 100]];
    entradas = registrarPrecio(entradas, '2026-09-08', 90);
    expect(entradas).toHaveLength(2);
    expect(entradas[0]).toEqual(['2026-09-08', 90, 90]);
  });

  it('dos observaciones del mismo día se funden en min/max', () => {
    let e = registrarPrecio([], '2026-09-08', 120);
    e = registrarPrecio(e, '2026-09-08', 95);
    e = registrarPrecio(e, '2026-09-08', 130);
    expect(e).toHaveLength(1);
    expect(e[0]).toEqual(['2026-09-08', 95, 130]);
  });
});

describe('diasEntre — días de calendario, no observaciones', () => {
  it('un único día observado es 1 día, no 0', () => {
    expect(diasEntre('2026-08-20', '2026-08-20')).toBe(1);
  });

  it('cuenta los dos extremos', () => {
    expect(diasEntre('2026-08-19', '2026-08-20')).toBe(2);
    expect(diasEntre('2026-08-01', '2026-08-20')).toBe(20);
  });

  it('cruza meses, años y febreros bisiestos sin despeinarse', () => {
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(2);   // 2026 no es bisiesto
    expect(diasEntre('2024-02-28', '2024-03-01')).toBe(3);   // 2024 sí
    expect(diasEntre('2025-12-31', '2026-01-01')).toBe(2);
  });

  it('ante basura o extremos al revés devuelve 0: sin ventana no se afirma nada', () => {
    const basura = [
      [null, '2026-08-20'],
      ['2026-08-20', undefined],
      ['ayer', 'hoy'],
      [42, 42],
      ['2026-08-20', '2026-08-01'],
    ];
    for (const [a, b] of basura) expect(diasEntre(a, b)).toBe(0);
  });
});

describe('resumirHistorico — la ventana de calendario', () => {
  it('reporta también la fecha más reciente, para poder medir la ventana', () => {
    const r = resumirHistorico([
      ['2026-08-18', 300, 300],
      ['2026-08-20', 300, 300],
      ['2026-08-19', 300, 300],
    ]);
    expect(r.desde).toBe('2026-08-18');
    expect(r.hasta).toBe('2026-08-20');
    expect(diasEntre(r.desde, r.hasta)).toBe(3);
  });
});

/**
 * Este veredicto ACUSA por su nombre a un vendedor real de publicidad
 * engañosa. Un falso positivo aquí no es un test rojo: es una acusación
 * pública a un negocio honesto. Estos tests fijan cada puerta que lo impide.
 */
describe('veredictoPrecio — descuento falso: las puertas del veredicto', () => {
  const plana = (n, precio) => serie(n, precio);

  /** `n` observaciones repartidas dentro de una ventana FIJA de 20 días. */
  const conHuecos = (n, precio = 500) => {
    const s = serie(20, precio);                 // 2026-08-01 … 2026-08-20
    return [s[0], s[19], ...s.slice(1, n - 1)];  // conserva los dos extremos
  };

  it('NO acusa cuando el precio de HOY sí bajó: la rebaja es real', () => {
    // El historial se registra DESPUÉS del build, así que el día en que un
    // precio baja de verdad el histórico sigue plano. Sin mirar el precio
    // actual se acusaría al vendedor el único día en que la oferta es cierta.
    const v = veredictoPrecio(600, resumirHistorico(plana(20, 1000)), { descuento: 40 });
    expect(v.nivel).not.toBe('descuento-falso');
    expect(v.texto).not.toMatch(/no ha bajado/);
  });

  it('sí acusa si el precio de hoy sigue dentro de la banda plana', () => {
    // La contraparte del test anterior: mirar el precio actual no desactiva el
    // veredicto, solo lo condiciona.
    const v = veredictoPrecio(1000, resumirHistorico(plana(20, 1000)), { descuento: 40 });
    expect(v.nivel).toBe('descuento-falso');
  });

  it('NO acusa con historia dispersa: quince fotos no son cuarenta días', () => {
    const espaciada = Array.from({ length: 15 }, (_, i) => [
      new Date(Date.parse('2026-08-20') - i * 3 * 86_400_000).toISOString().slice(0, 10),
      500,
      500,
    ]);
    const r = resumirHistorico(espaciada);
    expect(r.dias).toBe(15);
    expect(diasEntre(r.desde, r.hasta)).toBe(43);   // 28 días sin observar
    expect(veredictoPrecio(500, r, { descuento: 46 }).nivel).not.toBe('descuento-falso');
  });

  it('el texto cuenta días de CALENDARIO, no cuántas veces miramos', () => {
    const r = resumirHistorico(conHuecos(18));
    const v = veredictoPrecio(500, r, { descuento: 46 });
    expect(v.nivel).toBe('descuento-falso');
    expect(v.texto).toContain('20 días');   // la ventana observada
    expect(v.dias).toBe(18);                // las observaciones, que son menos
    expect(v.texto).not.toContain('18 días');
  });

  it('NO acusa con un descuento imposible, ni lo imprime', () => {
    const imposibles = [Infinity, -Infinity, NaN, 250, 100, -30, 'mucho', null, undefined, {}];
    for (const descuento of imposibles) {
      const v = veredictoPrecio(500, resumirHistorico(plana(20, 500)), { descuento });
      expect(v.nivel).not.toBe('descuento-falso');
      expect(v.texto).not.toMatch(/Infinity|NaN|undefined|null/);
    }
  });

  it('un tercer argumento null no truena: el feed escribe descuento: null', () => {
    const r = resumirHistorico(plana(20, 500));
    expect(() => veredictoPrecio(500, r, null)).not.toThrow();
    expect(veredictoPrecio(500, r, null).nivel).toBe('minimo');
    expect(veredictoPrecio(500, r, undefined).nivel).toBe('minimo');
  });

  it('un rango imposible degrada en vez de acusar', () => {
    // [fecha, 100, -5] pasa el filtro de resumirHistorico (solo comprueba
    // e[1] > 0) y deja el máximo por debajo del mínimo. Rango desconocido.
    const corrupta = plana(20, 500).map(([fecha, min]) => [fecha, min, -5]);
    const r = resumirHistorico(corrupta);
    expect(r.maximo).toBeLessThan(r.minimo);
    expect(veredictoPrecio(500, r, { descuento: 46 }).nivel).not.toBe('descuento-falso');
  });

  it('DIAS_DESCUENTO_FALSO es el umbral real, no un número suelto', () => {
    const corto = resumirHistorico(plana(DIAS_DESCUENTO_FALSO - 1, 500));
    const justo = resumirHistorico(plana(DIAS_DESCUENTO_FALSO, 500));
    expect(veredictoPrecio(500, corto, { descuento: 46 }).nivel).not.toBe('descuento-falso');
    expect(veredictoPrecio(500, justo, { descuento: 46 }).nivel).toBe('descuento-falso');
  });

  it('DESCUENTO_SOSPECHOSO es el umbral real, no un número suelto', () => {
    const r = resumirHistorico(plana(20, 500));
    expect(veredictoPrecio(500, r, { descuento: DESCUENTO_SOSPECHOSO - 1 }).nivel).not.toBe('descuento-falso');
    expect(veredictoPrecio(500, r, { descuento: DESCUENTO_SOSPECHOSO }).nivel).toBe('descuento-falso');
  });

  it('«plano» aguanta un 2 % de oscilación y ni un pelo más', () => {
    // MARGEN_PLANO es privado a propósito; se fija aquí por comportamiento.
    const enElBorde = [...serie(19, 510), ['2026-08-01', 500, 500]];   // max = min × 1.02
    const pasado = [...serie(19, 515), ['2026-08-01', 500, 500]];      // max = min × 1.03
    expect(veredictoPrecio(510, resumirHistorico(enElBorde), { descuento: 46 }).nivel).toBe('descuento-falso');
    expect(veredictoPrecio(515, resumirHistorico(pasado), { descuento: 46 }).nivel).not.toBe('descuento-falso');
  });

  it('la densidad exigida de la ventana es 0.7 y se comprueba en el borde', () => {
    // DENSIDAD_MINIMA también es privada: 20 días de calendario exigen 14
    // observaciones. Con 13 el sitio se calla.
    expect(veredictoPrecio(500, resumirHistorico(conHuecos(14)), { descuento: 46 }).nivel).toBe('descuento-falso');
    expect(veredictoPrecio(500, resumirHistorico(conHuecos(13)), { descuento: 46 }).nivel).not.toBe('descuento-falso');
  });

  it('un rango invertido tampoco acusa, aunque el precio de hoy encaje', () => {
    // min/max intercambiados en el archivo: [fecha, 500, 490]. El máximo queda
    // POR DEBAJO del mínimo, así que el rango es desconocido, no plano. Con un
    // precio de hoy dentro de la banda, esta es la única puerta que lo frena.
    const invertida = serie(20, 0).map(([fecha]) => [fecha, 500, 490]);
    const r = resumirHistorico(invertida);
    expect(r.minimo).toBe(500);
    expect(r.maximo).toBe(490);
    expect(veredictoPrecio(495, r, { descuento: 46 }).nivel).not.toBe('descuento-falso');
  });
});
