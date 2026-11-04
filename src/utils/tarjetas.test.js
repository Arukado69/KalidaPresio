/**
 * Tests de la tarjeta de promoción.
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
import { partirLineas, esc, pesos, svgHistoria, svgTarjeta, finAbsoluto, confFuentes } from './tarjetas.js';

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
  it('formatea en pesos mexicanos, con centavos solo si los hay (nunca redondea)', () => {
    expect(pesos(337.5)).toBe('$337.50');
    expect(pesos(99.59)).toBe('$99.59');
    expect(pesos(1981)).toBe('$1,981');
  });

  it('un precio ilegible no imprime NaN en la tarjeta', () => {
    expect(pesos(null)).toBe('$0');
    expect(pesos('abc')).toBe('$0');
    expect(pesos(undefined)).toBe('$0');
  });
});

describe('svgHistoria', () => {
  const base = {
    id: 'MLM1', codigo: 17, numero: 3, titulo: 'palabra '.repeat(40), precio_actual: 869, precio_previo: 2299,
    descuento: 62, relampago: true, termina: '2026-10-27T05:00:00Z',
  };

  it('nada del texto de precio y fin cae sobre el botón «link en mi perfil»', () => {
    // Peor caso: título de 3 líneas + precio anterior + hora de fin. El botón
    // empieza en y=1660; la última línea de texto tiene que quedar antes.
    const svg = svgHistoria(base);
    const ys = [...svg.matchAll(/<text[^>]*\sy="(\d+)"[^>]*>(?!LINK|kalidapresio)/g)].map((m) => Number(m[1]));
    const sobreBoton = ys.filter((y) => y > 1640 && y < 1790);
    expect(sobreBoton).toEqual([]);
  });

  it('lleva el código fijo del producto, su dirección corta y la hora de fin en hora de CDMX', () => {
    const svg = svgHistoria(base);
    expect(svg).toContain('LINK EN MI PERFIL · K-17');
    expect(svg).toContain('kalidapresio.albis-labs.xyz/k/17');
    expect(svg).not.toContain('#3');
    expect(svg).toContain('TERMINA 26 OCT · 23:00');
  });

  it('sin código fijo cae a la posición de /hoy', () => {
    const svg = svgHistoria({ ...base, codigo: null });
    expect(svg).toContain('LINK EN MI PERFIL · #3');
    expect(svg).toContain('kalidapresio.albis-labs.xyz/hoy');
  });

  it('sin hora de fin real no inventa una', () => {
    expect(svgHistoria({ ...base, termina: null })).not.toContain('TERMINA');
  });
});

describe('svgTarjeta (post 4:5)', () => {
  const o = {
    id: 'MLM1', codigo: 17, titulo: 'Licuadora & batidora «Pro»', precio_actual: 1499, precio_previo: 2299,
    descuento: 35, score: 88, rating: 4.7, vendidos: 12000, historico: { texto: 'El precio más bajo en 46 días' },
  };

  it('lleva el código fijo y la dirección corta', () => {
    const svg = svgTarjeta(o, false);
    expect(svg).toContain('K-17');
    expect(svg).toContain('/k/17');
  });

  it('sin calificación dice «sin calificar», no «Sello K-P 0»', () => {
    const svg = svgTarjeta({ ...o, score: 0, rating: 0, vendidos: 0, calificado: false }, false);
    expect(svg).toContain('SIN CALIFICAR');
    expect(svg).not.toContain('SELLO K-P 0');
  });

  it('la variante de mentira lo dice con un sello', () => {
    expect(svgTarjeta(o, true)).toContain('PURO CUENTO');
    expect(svgTarjeta(o, false)).not.toContain('PURO CUENTO');
  });

  it('escapa el título y no usa caracteres que las fuentes de la marca no tienen', () => {
    const svg = svgTarjeta(o, false) + svgHistoria(o);
    expect(svg).toContain('Licuadora &amp; batidora');
    expect(svg).not.toContain('★'); // la estrella se dibuja; en la fuente sale un cuadrito
  });
});

describe('confFuentes', () => {
  it('le da a sharp solo la carpeta de fuentes del repo', () => {
    const xml = confFuentes('/repo/src/assets/fuentes', '/tmp/fc');
    expect(xml).toContain('<dir>/repo/src/assets/fuentes</dir>');
    expect(xml).toContain('<cachedir>/tmp/fc</cachedir>');
  });
});

describe('finAbsoluto', () => {
  it('fecha y hora absolutas de CDMX, o null', () => {
    expect(finAbsoluto('2026-10-27T05:00:00Z')).toBe('26 oct · 23:00');
    expect(finAbsoluto(null)).toBeNull();
  });
});
