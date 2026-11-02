/**
 * Tests de las páginas por producto.
 *
 * Lo que se protege: que la URL de un producto no cambie aunque cambie su
 * título (un enlace compartido o indexado no se puede romper), que la página
 * no desaparezca cuando el precio vence o el producto se retira, y que la
 * gráfica no invente precios donde nadie miró.
 */
import { describe, it, expect } from 'vitest';
import { slugProducto, normalizarProducto } from './vitrina.js';
import { paginasDeVitrina, seriePrecios, graficaPrecios } from './paginaProducto.js';

const AHORA = Date.parse('2026-10-30T18:00:00Z');
const DIA = 86_400_000;

const entrada = (extra = {}) => ({
  link: 'https://meli.la/1AbCdE',
  titulo: 'Samsung Galaxy A16 128 GB',
  precio: 2389,
  precio_antes: 4949,
  revisado: new Date(AHORA - DIA).toISOString(),
  url_producto: 'https://www.mercadolibre.com.mx/telefono-celular-samsung-galaxy-a16-128-gb-4-gb-de-ram-nfc-verde-claro/p/MLM44113911',
  ...extra,
});

describe('slugProducto — una URL que no se rompe', () => {
  it('sale de las palabras de la ficha de catálogo y del id', () => {
    const slug = slugProducto({ id: 'MLM44113911', url_producto: entrada().url_producto, titulo: 'x' });
    expect(slug).toMatch(/^telefono-celular-samsung-galaxy-a16-[a-z0-9-]*-mlm44113911$/);
    expect(slug.length).toBeLessThanOrEqual(50 + 1 + 'mlm44113911'.length);
  });

  it('NO cambia si cambias el título', () => {
    const a = slugProducto({ id: 'MLM44113911', url_producto: entrada().url_producto, titulo: 'Galaxy A16' });
    const b = slugProducto({ id: 'MLM44113911', url_producto: entrada().url_producto, titulo: 'Galaxy A16 (corregido)' });
    expect(a).toBe(b);
  });

  it('lee también las URL de artículo', () => {
    expect(slugProducto({ id: 'MLM1932698151', url_producto: 'https://articulo.mercadolibre.com.mx/MLM-1932698151-hidrolavadora-electrica-1600-psi-_JM' }))
      .toBe('hidrolavadora-electrica-1600-psi-mlm1932698151');
  });

  it('sin URL usa el título, sin acentos ni símbolos', () => {
    expect(slugProducto({ id: 'kp-1AbCdE', titulo: 'Bocina «Aiwa» Ñandú 100 % ¡Nueva!' })).toBe('bocina-aiwa-nandu-100-nueva-kp-1abcde');
  });

  it('el producto normalizado ya trae su slug', () => {
    expect(normalizarProducto(entrada(), AHORA).producto.slug).toMatch(/-mlm44113911$/);
  });
});

describe('paginasDeVitrina — la página se queda', () => {
  it('un producto publicable tiene página vigente', () => {
    const [p] = paginasDeVitrina({ productos: [entrada()] }, AHORA);
    expect(p).toMatchObject({ estado: 'vigente', motivo: null, retirado: null });
    expect(p.slug).toBe(p.producto.slug);
  });

  it('con el precio vencido la página NO desaparece: queda «vencido» con su motivo', () => {
    const [p] = paginasDeVitrina({ productos: [entrada({ revisado: new Date(AHORA - 9 * DIA).toISOString() })] }, AHORA);
    expect(p.estado).toBe('vencido');
    expect(p.motivo).toMatch(/7 días/);
  });

  it('una relámpago terminada también se queda, como vencida', () => {
    const [p] = paginasDeVitrina({ productos: [entrada({ relampago: true, termina: new Date(AHORA - DIA).toISOString() })] }, AHORA);
    expect(p.estado).toBe('vencido');
  });

  it('un producto retirado se queda con su fecha de retiro', () => {
    const [p] = paginasDeVitrina({ productos: [], retirados: [entrada({ retirado: '2026-10-29T12:00:00Z' })] }, AHORA);
    expect(p).toMatchObject({ estado: 'retirado', retirado: '2026-10-29T12:00:00.000Z' });
  });

  it('un borrador sin link oficial no tiene página: nunca se publicó', () => {
    expect(paginasDeVitrina({ productos: [entrada({ link: '' }), entrada({ link: 'https://www.mercadolibre.com.mx/x?matt_tool=1' })] }, AHORA)).toEqual([]);
  });

  it('si el mismo producto está activo y retirado, manda el activo', () => {
    const paginas = paginasDeVitrina({ productos: [entrada()], retirados: [entrada({ retirado: '2026-10-01T00:00:00Z' })] }, AHORA);
    expect(paginas.map((p) => p.estado)).toEqual(['vigente']);
  });
});

describe('seriePrecios y graficaPrecios — sin inventar precios', () => {
  const entradas = [
    ['2026-10-08', 869, 958],
    ['2026-10-06', 900, 900],
    ['2026-10-07', 880, 880],
    ['2026-10-30', 999, 999],
    ['basura', 1, 1],
  ];

  it('ordena del más viejo al más nuevo y descarta lo que no es un día válido', () => {
    expect(seriePrecios(entradas).map((p) => p.fecha)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-30']);
  });

  it('respeta la ventana de días', () => {
    expect(seriePrecios(entradas, { hasta: '2026-10-30', dias: 3 }).map((p) => p.fecha)).toEqual(['2026-10-30']);
  });

  it('el eje X va por fecha: un hueco largo corta la línea en vez de unir los puntos', () => {
    const g = graficaPrecios(seriePrecios(entradas));
    expect(g.ruta.split(' ').map((s) => s[0])).toEqual(['M', 'L', 'L', 'M']);
    const [a, b, c, d] = g.puntos.map((p) => p.x);
    expect(b - a).toBeCloseTo(c - b, 0);
    expect(d - c).toBeGreaterThan(10 * (c - b));
  });

  it('un precio más alto queda más arriba (Y menor), y el mínimo marca su línea', () => {
    const g = graficaPrecios(seriePrecios(entradas));
    const [p0, p1] = g.puntos;
    expect(p0.yMin).toBeLessThan(p1.yMin); // 900 arriba de 880
    expect(g.minimo).toBe(869);
    expect(g.maximo).toBe(999);
    expect(g.yMinimo).toBe(g.puntos[2].yMin);
  });

  it('con menos de dos días no hay gráfica', () => {
    expect(graficaPrecios(seriePrecios([['2026-10-30', 1, 1]]))).toBeNull();
    expect(graficaPrecios(null)).toBeNull();
  });

  it('un precio que nunca se movió no truena (queda al centro)', () => {
    const g = graficaPrecios([{ fecha: '2026-10-01', min: 500, max: 500 }, { fecha: '2026-10-02', min: 500, max: 500 }]);
    expect(g.puntos[0].yMin).toBeCloseTo(90, 0);
  });
});
