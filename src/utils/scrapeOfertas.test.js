/**
 * Tests del núcleo de scraping.
 *
 * Lo que se protege: que la paginación produzca las URLs que ML entiende y que
 * el extractor grite en vez de devolver vacío cuando el HTML cambia. Un
 * extractor que devuelve [] en silencio es exactamente lo que dejó el feed 43
 * días muerto sin que nadie se enterara.
 */
import { describe, it, expect } from 'vitest';
import { urlPagina, extraerAppProps, URL_OFERTAS } from './scrapeOfertas.js';

describe('urlPagina', () => {
  it('la página 1 es la URL desnuda, sin query', () => {
    expect(urlPagina(1)).toBe(URL_OFERTAS);
    expect(urlPagina()).toBe(URL_OFERTAS);
  });

  it('de la 2 en adelante añade ?page=', () => {
    expect(urlPagina(2)).toBe(`${URL_OFERTAS}?page=2`);
    expect(urlPagina(5)).toBe(`${URL_OFERTAS}?page=5`);
  });

  it('rechaza páginas que no son enteros positivos', () => {
    expect(() => urlPagina(0)).toThrow();
    expect(() => urlPagina(-1)).toThrow();
    expect(() => urlPagina(1.5)).toThrow();
    expect(() => urlPagina('dos')).toThrow();
  });
});

describe('extraerAppProps', () => {
  const envolver = (items) =>
    `<html><script>window.x={"appProps":${JSON.stringify({ pageProps: { data: { items } } })},"mainEntry":1}</script></html>`;

  it('saca los items del payload', () => {
    const items = extraerAppProps(envolver([{ card: { metadata: { id: 'MLM1' } } }]));
    expect(items).toHaveLength(1);
    expect(items[0].card.metadata.id).toBe('MLM1');
  });

  it('devuelve lista vacía si el payload trae cero items, sin reventar', () => {
    expect(extraerAppProps(envolver([]))).toEqual([]);
  });

  it('LANZA si no encuentra appProps — no devuelve vacío en silencio', () => {
    expect(() => extraerAppProps('<html>nada</html>')).toThrow(/appProps/);
    expect(() => extraerAppProps('')).toThrow(/appProps/);
    expect(() => extraerAppProps(null)).toThrow(/appProps/);
  });
});
