/**
 * Tests de la lógica de negocio pura.
 *
 * Son las cuatro funciones que deciden QUÉ se muestra, EN QUÉ ORDEN y A DÓNDE
 * lleva el clic. Ninguna toca red, disco ni DOM, así que blindarlas cuesta
 * poco y protege el camino del dinero.
 */
import { describe, it, expect } from 'vitest';
import { calcularScorePorSeccion, scoreEfectivo, PESOS_SECCION } from './scoreSecciones.js';
import { aLinkAfiliado } from './afiliado.js';
import { categorizar, ORDEN_CATEGORIAS } from './categorias.js';
import { generarVeredicto, tierKP } from './veredicto.js';

describe('calcularScorePorSeccion', () => {
  it('da 100 al item perfecto con pesos estándar', () => {
    expect(calcularScorePorSeccion({ rating: 5, descuento: 40, vendidos: 100_000 }, 'relampago')).toBe(100);
  });

  it('da 0 cuando no hay ninguna señal', () => {
    expect(calcularScorePorSeccion({ rating: 0, descuento: 0, vendidos: 0 }, 'relampago')).toBe(0);
  });

  it('topa el descuento en 40%: 60% no puntúa más que 40%', () => {
    const base = { rating: 4, vendidos: 1000 };
    expect(calcularScorePorSeccion({ ...base, descuento: 60 }, 'default'))
      .toBe(calcularScorePorSeccion({ ...base, descuento: 40 }, 'default'));
  });

  it('satura el volumen a partir de 100 mil vendidos', () => {
    const base = { rating: 4, descuento: 20 };
    expect(calcularScorePorSeccion({ ...base, vendidos: 250_000 }, 'default'))
      .toBe(calcularScorePorSeccion({ ...base, vendidos: 100_000 }, 'default'));
  });

  it('en imbatibles el volumen pesa más que el descuento (decisión 2026-06-11)', () => {
    // Un item SIN descuento pero con muchas opiniones no debe hundirse: los
    // imbatibles son precio-permanente-bajo y ML no manda previous_price.
    const sinDescuento = { rating: 4.8, descuento: 0, vendidos: 10_000 };
    expect(calcularScorePorSeccion(sinDescuento, 'imbatibles'))
      .toBeGreaterThan(calcularScorePorSeccion(sinDescuento, 'default'));
    expect(PESOS_SECCION.imbatibles.volumen).toBeGreaterThan(PESOS_SECCION.default.volumen);
  });

  it('una sección desconocida cae en los pesos por defecto', () => {
    const item = { rating: 4.2, descuento: 25, vendidos: 3000 };
    expect(calcularScorePorSeccion(item, 'seccion-que-no-existe'))
      .toBe(calcularScorePorSeccion(item, 'default'));
  });

  it('no truena con campos ausentes ni valores fuera de rango', () => {
    expect(calcularScorePorSeccion({}, 'default')).toBe(0);
    expect(calcularScorePorSeccion({ rating: 9, descuento: -5, vendidos: -100 }, 'default')).toBe(65);
  });
});

describe('scoreEfectivo', () => {
  it('respeta el score ya persistido en el feed', () => {
    expect(scoreEfectivo({ score_kalidad_presio: 42, rating: 5, vendidos: 100_000, descuento: 40 })).toBe(42);
  });

  it('lo recalcula cuando falta', () => {
    expect(scoreEfectivo({ rating: 5, descuento: 40, vendidos: 100_000 })).toBe(100);
  });

  it('conserva un score persistido de 0 (no lo confunde con "ausente")', () => {
    expect(scoreEfectivo({ score_kalidad_presio: 0, rating: 5 })).toBe(0);
  });
});

describe('aLinkAfiliado — el camino del dinero', () => {
  const URL_ML = 'https://www.mercadolibre.com.mx/producto/p/MLM123';

  it('pega matt_tool y matt_word a una URL limpia', () => {
    const r = new URL(aLinkAfiliado(URL_ML));
    expect(r.searchParams.get('matt_tool')).toBeTruthy();
    expect(r.searchParams.get('matt_word')).toBeTruthy();
  });

  it('descarta los parámetros previos en vez de acumularlos', () => {
    const r = aLinkAfiliado(`${URL_ML}?matt_tool=OTRO&utm_source=facebook#resenas`);
    expect(r).not.toContain('OTRO');
    expect(r).not.toContain('utm_source');
    expect(r).not.toContain('#resenas');
  });

  it('etiqueta la campaña de sección en el matt_word', () => {
    const base = new URL(aLinkAfiliado(URL_ML)).searchParams.get('matt_word');
    const conCampana = new URL(aLinkAfiliado(URL_ML, 'relampago')).searchParams.get('matt_word');
    expect(conCampana).toBe(`${base}_relampago`);
  });

  it('sanea la campaña: nada que rompa el parámetro', () => {
    const word = new URL(aLinkAfiliado(URL_ML, 'menos-500 &raro')).searchParams.get('matt_word');
    expect(word).toMatch(/_menos500raro$/);
  });

  it('degrada a "#" con entradas inservibles en vez de generar un enlace roto', () => {
    for (const malo of [null, undefined, '', '   ', 42, {}]) {
      expect(aLinkAfiliado(malo)).toBe('#');
    }
  });
});

describe('categorizar', () => {
  it('clasifica por palabra clave del título', () => {
    expect(categorizar('Laptop Gamer Lenovo IdeaPad 15.6"')).toBe('Tecnología');
    expect(categorizar('Licuadora Oster de vaso de vidrio')).toBe('Cocina');
    expect(categorizar('Colchón Matrimonial Memory Foam')).toBe('Hogar');
    expect(categorizar('CeraVe Crema Hidratante Facial 454 g')).toBe('Belleza');
    expect(categorizar('Proteína Whey 2 kg chocolate')).toBe('Salud y Deporte');
    expect(categorizar('Taladro inalámbrico 20V')).toBe('Herramientas');
  });

  it('ignora mayúsculas y acentos del catálogo real', () => {
    expect(categorizar('AUDÍFONOS Bluetooth')).toBe('Tecnología');
    expect(categorizar('audifonos bluetooth')).toBe('Tecnología');
  });

  it('degrada a "Otros" y nunca truena', () => {
    expect(categorizar('Objeto sin categoría reconocible')).toBe('Otros');
    expect(categorizar('')).toBe('Otros');
    expect(categorizar()).toBe('Otros');
  });

  it('toda categoría que puede devolver está en el orden de los chips', () => {
    const muestras = ['laptop', 'licuadora', 'colchón', 'crema', 'creatina', 'pijama', 'taladro', 'zzz'];
    for (const t of muestras) {
      expect(ORDEN_CATEGORIAS).toContain(categorizar(t));
    }
  });
});

describe('tierKP', () => {
  it('corta en los mismos umbrales que el sello visual', () => {
    expect(tierKP(95)).toBe('Excepcional');
    expect(tierKP(90)).toBe('Excepcional');
    expect(tierKP(89)).toBe('Excelente');
    expect(tierKP(80)).toBe('Excelente');
    expect(tierKP(79)).toBe('Buena');
    expect(tierKP(70)).toBe('Buena');
    expect(tierKP(69)).toBe('Aceptable');
    expect(tierKP(55)).toBe('Aceptable');
    expect(tierKP(54)).toBe('Baja');
  });

  it('trata la ausencia de score como 0, no como NaN', () => {
    expect(tierKP(undefined)).toBe('Baja');
    expect(tierKP('no es un número')).toBe('Baja');
  });
});

describe('generarVeredicto', () => {
  it('abre por volumen de ventas cuando esa es la señal más fuerte', () => {
    // ML retiró la insignia "MÁS VENDIDO": el umbral de 10 mil unidades hace el
    // mismo papel y es un dato publicado, no una etiqueta editorial.
    const v = generarVeredicto({ rating: 4.7, vendidos: 12_000, descuento: 10 });
    expect(v).toMatch(/más vendido/i);
    expect(v).toContain('4.7');
  });

  it('abre por el descuento cuando es grande y la calificación aguanta', () => {
    expect(generarVeredicto({ rating: 4.6, vendidos: 3000, descuento: 55 })).toMatch(/55%/);
  });

  it('formatea los miles de unidades de forma legible', () => {
    expect(generarVeredicto({ rating: 4.8, vendidos: 1200 })).toContain('1.2 mil');
    expect(generarVeredicto({ rating: 4.8, vendidos: 15_000 })).toContain('15 mil');
  });

  it('cierra con las señales de confianza que existan', () => {
    const base = { rating: 4.5, vendidos: 2000 };
    expect(generarVeredicto({ ...base, vendedor_confiable: true, envio_gratis: true }))
      .toContain('Vendedor reputado y envío gratis.');
    expect(generarVeredicto({ ...base, envio_gratis: true })).toContain('Con envío gratis.');
    expect(generarVeredicto({ ...base, vendedor_confiable: true })).toContain('De un vendedor reputado.');
  });

  it('nunca devuelve vacío, ni sin datos', () => {
    expect(generarVeredicto({}).length).toBeGreaterThan(10);
    expect(generarVeredicto().length).toBeGreaterThan(10);
  });

  it('no inventa cifras que no vienen en el feed', () => {
    // Sin rating ni ventas no debe aparecer ningún "★" ni conteo.
    const v = generarVeredicto({ descuento: 30 });
    expect(v).not.toContain('★');
    expect(v).not.toMatch(/\bvendidos\b/);
  });
});
