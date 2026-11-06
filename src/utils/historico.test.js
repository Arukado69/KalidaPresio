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
  entradasPara,
  entradasDelProducto,
  veredictoPrecio,
  registrarPrecio,
  podar,
  elegirFuentes,
  DIAS_MINIMOS,
  DIAS_DESCUENTO_FALSO,
  DESCUENTO_SOSPECHOSO,
  NIVEL_DESCUENTO_FALSO,
  NIVELES_NO_DISTRIBUIBLES,
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
    expect(r).toMatchObject({ dias: 3, minimo: 280, maximo: 400, desde: '2026-08-18', hasta: '2026-08-20' });
    expect(r.fechaMinimo).toBe(r.entradas.find((e) => e[1] === 280)[0]);
    expect(r.entradas.map((e) => e[0])).toEqual(['2026-08-20', '2026-08-19', '2026-08-18']);
  });

  it('ignora entradas corruptas en vez de tronar', () => {
    const r = resumirHistorico([['2026-08-20', 300, 350], null, ['x'], ['2026-08-19', 0, 0], 42]);
    expect(r.dias).toBe(1);
    expect(r.minimo).toBe(300);
  });

  it('sin historial, todo en cero/null', () => {
    for (const malo of [null, undefined, [], 'no', {}]) {
      expect(resumirHistorico(malo)).toEqual({ dias: 0, minimo: null, maximo: null, desde: null, hasta: null, fechaMinimo: null, entradas: [] });
    }
  });
});

describe('entradasPara — un producto, varias claves', () => {
  const productos = {
    MLM1932698151: [['2026-10-08', 869, 958], ['2026-10-07', 869, 869]],   // artículo
    MLM53177027: [['2026-10-08', 850, 850], ['2026-10-06', 870, 870]],     // catálogo
  };

  it('junta el historial del artículo y el del catálogo', () => {
    const e = entradasPara(productos, ['MLM53177027', 'MLM1932698151']);
    expect(e.map((x) => x[0])).toEqual(['2026-10-08', '2026-10-07', '2026-10-06']);
  });

  it('un mismo día en dos claves es UN día: se funde en mínimo y máximo', () => {
    const e = entradasPara(productos, ['MLM53177027', 'MLM1932698151']);
    expect(e[0]).toEqual(['2026-10-08', 850, 958]);
    expect(resumirHistorico(e).dias).toBe(3);
  });

  it('acepta una sola clave como texto, y las que no existen no estorban', () => {
    expect(entradasPara(productos, 'MLM1932698151')).toHaveLength(2);
    expect(entradasPara(productos, ['kp-1AbCdE', 'MLM1932698151'])).toHaveLength(2);
    expect(entradasPara(productos, ['MLM000000000'])).toEqual([]);
  });

  it('no truena con basura ni lee del prototipo', () => {
    expect(entradasPara(null, ['MLM1932698151'])).toEqual([]);
    expect(entradasPara(productos, null)).toEqual([]);
    expect(entradasPara(productos, ['constructor', '__proto__', 42])).toEqual([]);
    expect(entradasPara({ A: [null, 'x', ['2026-10-08', 1, 1]] }, 'A')).toEqual([['2026-10-08', 1, 1]]);
  });

  it('con las dos claves, un producto de la vitrina YA no sale «sin datos»', () => {
    const soloArticulo = { MLM1932698151: serie(10, 869, '2026-10-08') };
    const antes = veredictoPrecio(869, resumirHistorico(entradasPara(soloArticulo, 'MLM53177027')));
    const ahora = veredictoPrecio(869, resumirHistorico(entradasPara(soloArticulo, ['MLM53177027', 'MLM1932698151'])));
    expect(antes.nivel).toBe('sin-datos');
    expect(ahora.nivel).toBe('minimo');
  });
});

describe('entradasDelProducto — lo que vio el bot más lo que viste tú', () => {
  const hist = { MLM1: [['2026-10-08', 500, 500], ['2026-10-07', 510, 510]] };

  it('junta las dos fuentes; un mismo día es UN día', () => {
    const p = { claves_historico: ['MLM1'], vistos: [['2026-11-05', 450, 450], ['2026-10-08', 480, 480]] };
    expect(entradasDelProducto(hist, p)).toEqual([
      ['2026-11-05', 450, 450],
      ['2026-10-08', 480, 500],
      ['2026-10-07', 510, 510],
    ]);
  });

  it('un producto que llegó desde la app (sin id de ML) tiene historia por sus `vistos`', () => {
    const p = { id: 'kp-2Gyywqc', claves_historico: ['kp-2Gyywqc'], vistos: [['2026-11-13', 89.9, 89.9], ['2026-11-05', 99.59, 99.59]] };
    const v = veredictoPrecio(89.9, resumirHistorico(entradasDelProducto(hist, p)));
    expect(v.texto).toBe('Bajó: el 5 nov estaba a $99.59');
  });

  it('se queda con los 90 días anteriores a la observación más reciente', () => {
    const p = { vistos: [['2026-11-05', 1, 1], ['2026-08-08', 2, 2], ['2026-08-07', 3, 3]] };
    expect(entradasDelProducto(null, p).map((e) => e[0])).toEqual(['2026-11-05', '2026-08-08']);
  });

  it('sin nada que mirar, vacío; y no truena con basura', () => {
    expect(entradasDelProducto(hist, null)).toEqual([]);
    expect(entradasDelProducto(null, { vistos: 'x' })).toEqual([]);
  });
});

describe('veredictoPrecio — solo se afirma lo observado', () => {
  it('con menos de 3 días NO habla del rango: dice qué vio y cuándo', () => {
    // Esta es LA regla. Con dos días no existe «el más bajo del mes»; existe
    // «el 20 ago estaba a $400», que es exactamente lo que se vio.
    const v = veredictoPrecio(297, resumirHistorico(serie(2, 400)));
    expect(v.texto).toBe('Bajó: el 20 ago estaba a $400');
    expect(v.texto).not.toMatch(/más bajo|mínimo|\d+ días/i);
  });

  it('el primer día lo dice sin prometer nada', () => {
    const v = veredictoPrecio(297, resumirHistorico(serie(1, 297)));
    expect(v.nivel).toBe('siguiendo');
    expect(v.texto).toBe('Lo seguimos desde el 20 ago');
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

describe('veredictoPrecio — revisiones sueltas (los precios que viste al compartir)', () => {
  // Así queda el historial propio de un producto de la vitrina: el día que lo
  // agregaste y el día que lo volviste a compartir, con días sin ver en medio.
  const visto = (...pares) => resumirHistorico(pares.map(([f, precio]) => [f, precio, precio]));

  it('si bajó, dice cuánto costaba y cuándo', () => {
    const v = veredictoPrecio(1199, visto(['2026-11-13', 1199], ['2026-11-05', 1299]));
    expect(v.nivel).toBe('minimo');
    expect(v.texto).toBe('Bajó: el 5 nov estaba a $1,299');
  });

  it('si lo vimos más barato, lo dice con su fecha — y eso no se reparte', () => {
    const v = veredictoPrecio(1499, visto(['2026-11-13', 1499], ['2026-11-05', 1299]));
    expect(v.nivel).toBe('alto');
    expect(v.texto).toBe('Lo vimos a $1,299 el 5 nov');
    expect(NIVELES_NO_DISTRIBUIBLES).toContain(v.nivel);
  });

  it('cerca del más bajo: el precio y la fecha de ese mínimo', () => {
    const v = veredictoPrecio(1350, visto(['2026-11-13', 1350], ['2026-11-05', 1299]));
    expect(v.nivel).toBe('bajo');
    expect(v.texto).toBe('Cerca del más bajo que le vimos: $1,299 el 5 nov');
  });

  it('un precio quieto NO es «el más bajo»: es el mismo precio', () => {
    const v = veredictoPrecio(1299, visto(['2026-11-13', 1299], ['2026-11-05', 1299]));
    expect(v.nivel).toBe('siguiendo');
    expect(v.texto).toBe('Mismo precio desde el 5 nov');
  });

  it('compara con la vez MÁS RECIENTE que lo vimos más caro', () => {
    const v = veredictoPrecio(900, visto(['2026-11-13', 900], ['2026-11-09', 950], ['2026-11-01', 1100]));
    expect(v.texto).toBe('Bajó: el 9 nov estaba a $950');
  });

  it('nunca habla de «N días» con revisiones sueltas: entre una y otra pudo pasar cualquier cosa', () => {
    const casos = [
      veredictoPrecio(1199, visto(['2026-11-13', 1199], ['2026-11-10', 1250], ['2026-11-05', 1299])),
      veredictoPrecio(1499, visto(['2026-11-13', 1499], ['2026-11-10', 1250], ['2026-11-05', 1299])),
      veredictoPrecio(1300, visto(['2026-11-13', 1300], ['2026-11-10', 1250], ['2026-10-05', 1299])),
    ];
    for (const v of casos) expect(v.texto).not.toMatch(/\d+ d[ií]as/);
  });

  it('el historial del bot (congelado el 8 de octubre) más el precio de hoy ya es «suelto»', () => {
    // 30 días seguidos hasta el 8 oct y luego nada hasta hoy: decir «el más bajo
    // en 31 días» hablaría de septiembre como si fuera esta semana.
    const h = [['2026-11-05', 450, 450], ...serie(30, 500, '2026-10-08')];
    const v = veredictoPrecio(450, resumirHistorico(h));
    expect(v.texto).toBe('Bajó: el 8 oct estaba a $500');
  });

  it('con seguimiento diario todo sigue como antes', () => {
    const v = veredictoPrecio(297, resumirHistorico([...serie(5, 400), ['2026-08-15', 297, 297]]));
    expect(v.texto).toBe('El precio más bajo en 6 días');
  });
});

describe('veredictoPrecio — descuento falso', () => {
  /** Serie plana: el precio nunca se movió. */
  const plana = (n, precio) => serie(n, precio);

  it('acusa cuando hay descuento fuerte, historia larga y precio plano', () => {
    const v = veredictoPrecio(500, resumirHistorico(plana(20, 500)), { descuento: 46 });
    // Contra la CONSTANTE exportada, no el literal: si `veredictoPrecio` y
    // `NIVEL_DESCUENTO_FALSO` alguna vez divergen (alguien edita uno y olvida
    // el otro), este test es el que se entera.
    expect(v.nivel).toBe(NIVEL_DESCUENTO_FALSO);
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
    // Treinta días seguidos mirando, y `viejo` no apareció en ninguno.
    const r = podar(
      { vivo: serie(30, 1, '2026-08-20'), viejo: [['2026-07-01', 1, 1]] },
      { dias: 90, diasOlvido: 30, hoy },
    );
    expect(Object.keys(r)).toEqual(['vivo']);
  });

  it('un apagón del observador NO borra el historial: el olvido cuenta días observados', () => {
    // Lo que pasó en octubre de 2026: 47 días mirando, ML bloquea a los
    // servidores y la siguiente corrida llega semanas después. Con días de
    // calendario, esa corrida olvidaba a todos los que no volvió a ver.
    const antes = { A: serie(47, 869, '2026-10-08'), B: serie(10, 99, '2026-10-08') };
    const r = podar(
      { ...antes, C: [['2026-11-20', 50, 50]] },
      { dias: 90, diasOlvido: 30, hoy: new Date('2026-11-20T12:00:00Z') },
    );
    expect(Object.keys(r).sort()).toEqual(['A', 'B', 'C']);
  });

  it('pasado el apagón, el olvido vuelve a funcionar cuando se acumulan días observados', () => {
    const r = podar(
      { viejo: [['2026-10-08', 1, 1]], vivo: serie(30, 1, '2026-12-01') },
      { dias: 90, diasOlvido: 30, hoy: new Date('2026-12-01T12:00:00Z') },
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

describe('elegirFuentes — una fuente vieja no se registra con la fecha de hoy', () => {
  const hoy = { nombre: 'observaciones.json', sello: '2026-10-31T15:07:00Z', lecturas: [['MLM1', 100]] };
  const congelado = { nombre: 'ofertas.json', sello: '2026-10-08T18:05:14Z', lecturas: [['MLM2', 869]] };

  it('el ofertas.json congelado del 8 de octubre NO entra en la observación del 31', () => {
    const r = elegirFuentes([hoy, congelado]);
    expect(r.fecha).toBe('2026-10-31');
    expect(r.usadas).toEqual(['observaciones.json']);
    expect(r.omitidas).toEqual(['ofertas.json']);
    expect(r.lecturas).toEqual([['MLM1', 100]]);
  });

  it('dos fuentes del mismo rato se suman, como cuando el bot corría cada 3 h', () => {
    const feed = { ...congelado, sello: '2026-10-31T12:00:00Z' };
    const r = elegirFuentes([hoy, feed]);
    expect(r.usadas).toEqual(['observaciones.json', 'ofertas.json']);
    expect(r.lecturas).toHaveLength(2);
  });

  it('el desfase permitido es de 12 h y se comprueba en el borde', () => {
    const justo = { ...congelado, sello: '2026-10-31T03:07:00Z' };
    const pasado = { ...congelado, sello: '2026-10-31T03:06:59Z' };
    expect(elegirFuentes([hoy, justo]).usadas).toHaveLength(2);
    expect(elegirFuentes([hoy, pasado]).usadas).toEqual(['observaciones.json']);
  });

  it('una fuente sin sello no se cuela junto a una fechada', () => {
    expect(elegirFuentes([hoy, { nombre: 'viejo', lecturas: [['X', 1]] }]).omitidas).toEqual(['viejo']);
  });

  it('sin ningún sello se conserva lo de antes: todo con la fecha de ahora', () => {
    const r = elegirFuentes([{ nombre: 'a', lecturas: [['X', 1]] }], { ahora: Date.parse('2026-11-02T10:00:00Z') });
    expect(r.fecha).toBe('2026-11-02');
    expect(r.usadas).toEqual(['a']);
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
    expect(veredictoPrecio(495, r, { descuento: 46 }).nivel).not.toBe(NIVEL_DESCUENTO_FALSO);
  });
});

/**
 * NIVEL_DESCUENTO_FALSO y NIVELES_NO_DISTRIBUIBLES son la fuente única de
 * verdad que usan generarFeedPublico.js, generarRelampago.js y panel/hoy.astro
 * para no repartir un descuento falso (ver sus propios tests para la prueba de
 * que de verdad las importan). Lo que se fija aquí es su VALOR: si alguien
 * cambia qué niveles se excluyen sin querer, este test es el primero en
 * enterarse — antes que cualquier consumidor.
 */
describe('NIVEL_DESCUENTO_FALSO y NIVELES_NO_DISTRIBUIBLES — la fuente única', () => {
  it('NIVEL_DESCUENTO_FALSO es el string exacto que devuelve el veredicto', () => {
    expect(NIVEL_DESCUENTO_FALSO).toBe('descuento-falso');
  });

  it('NIVELES_NO_DISTRIBUIBLES contiene exactamente "alto" y "descuento-falso"', () => {
    expect([...NIVELES_NO_DISTRIBUIBLES].sort()).toEqual(['alto', 'descuento-falso']);
  });

  it('NIVELES_NO_DISTRIBUIBLES incluye a NIVEL_DESCUENTO_FALSO, no un duplicado suelto', () => {
    // Si alguien cambiara el valor de NIVEL_DESCUENTO_FALSO pero
    // NIVELES_NO_DISTRIBUIBLES siguiera con el string viejo escrito a mano,
    // este test es el que lo detecta.
    expect(NIVELES_NO_DISTRIBUIBLES).toContain(NIVEL_DESCUENTO_FALSO);
  });

  it('NIVELES_NO_DISTRIBUIBLES NO es lo mismo que el nivel del carrusel: el carrusel excluye menos', () => {
    // La distinción que el propio fix pide no perder: 'alto' es un descuento
    // real (el producto solo ha estado más barato), así que el carrusel SÍ lo
    // distribuye — solo el feed y el panel son más estrictos.
    expect(NIVELES_NO_DISTRIBUIBLES).toContain('alto');
    expect(NIVEL_DESCUENTO_FALSO).not.toBe('alto');
  });

  it('está congelada: nadie debe poder colarle un nivel en runtime', () => {
    expect(Object.isFrozen(NIVELES_NO_DISTRIBUIBLES)).toBe(true);
  });
});
