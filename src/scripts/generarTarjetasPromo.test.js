/**
 * Tests del generador de tarjetas.
 *
 * Lo que se protege aquí ya falló una vez: la primera versión estimaba el
 * ancho de carácter en 0.52 y el título se salía del lienzo por la derecha
 * («Barba y Bigo» cortado a media palabra). Un texto que se desborda no
 * rompe el build ni tumba nada — solo produce una imagen fea que se publica
 * en un canal público. Es exactamente el tipo de fallo que nadie nota hasta
 * que ya salió.
 *
 * El escapado XML también se prueba: los títulos de Mercado Libre traen
 * ampersands y comillas con frecuencia, y un `&` sin escapar no rompe el
 * SVG de forma visible — lo hace ilegible para sharp y la tarjeta sale vacía.
 */
import { describe, it, expect } from 'vitest';
import { partirLineas, esc, pesos } from './generarTarjetasPromo.js';

/** El ancho real de un renglón, con el mismo factor que usa el generador. */
const anchoAprox = (linea, tamano) => linea.length * tamano * 0.62;

describe('partirLineas', () => {
  it('ningún renglón se sale del ancho dado', () => {
    const titulo =
      'Minoxidil 5% Anacastel 3x2 Pack Tratamiento Anticaida Crecimiento de Cabello, Barba y Bigote';
    for (const linea of partirLineas(titulo, 38, 980, 2)) {
      expect(anchoAprox(linea, 38)).toBeLessThanOrEqual(980);
    }
  });

  it('respeta el máximo de renglones', () => {
    const largo = 'palabra '.repeat(60);
    expect(partirLineas(largo, 38, 980, 2)).toHaveLength(2);
    expect(partirLineas(largo, 38, 980, 3)).toHaveLength(3);
  });

  it('marca el corte con puntos suspensivos cuando sobró texto', () => {
    const largo = 'palabra '.repeat(60);
    const lineas = partirLineas(largo, 38, 980, 2);
    expect(lineas[1].endsWith('…')).toBe(true);
  });

  it('NO marca corte cuando el texto cabía entero', () => {
    const lineas = partirLineas('Título corto', 38, 980, 2);
    expect(lineas).toEqual(['Título corto']);
    expect(lineas[0]).not.toContain('…');
  });

  it('no parte una palabra por la mitad', () => {
    const lineas = partirLineas('Supercalifragilisticoespialidoso normal', 38, 400, 2);
    expect(lineas.join(' ')).toContain('Supercalifragilisticoespialidoso');
  });

  it('sobrevive a texto vacío o ausente sin reventar', () => {
    expect(partirLineas('', 38, 980, 2)).toEqual([]);
    expect(partirLineas(null, 38, 980, 2)).toEqual([]);
    expect(partirLineas(undefined, 38, 980, 2)).toEqual([]);
  });
});

describe('esc', () => {
  it('escapa lo que rompería el SVG', () => {
    expect(esc('Shampoo & Acondicionador')).toBe('Shampoo &amp; Acondicionador');
    expect(esc('Talla <M>')).toBe('Talla &lt;M&gt;');
    expect(esc('Pack "3x2"')).toBe('Pack &quot;3x2&quot;');
  });

  it('escapa el ampersand ANTES que el resto, sin doble escapado', () => {
    // Si el orden fuera al revés, `<` se volvería `&lt;` y luego su propio
    // `&` se re-escaparía a `&amp;lt;`, que se imprime literal en la tarjeta.
    expect(esc('a<b&c')).toBe('a&lt;b&amp;c');
  });

  it('convierte ausencia en cadena vacía, no en "null"', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('pesos', () => {
  it('formatea en pesos mexicanos sin centavos', () => {
    expect(pesos(337.5)).toMatch(/^\$33[78]$/);
    expect(pesos(1981)).toContain('1,981');
  });

  it('un precio ilegible no imprime NaN en la tarjeta', () => {
    expect(pesos(null)).toBe('$0');
    expect(pesos('abc')).toBe('$0');
    expect(pesos(undefined)).toBe('$0');
  });
});
