/**
 * Tests de lo que hace el panel con lo que manda el marcador (computadora).
 *
 * Lo que se protege: que un producto completo se guarde sin formulario, que
 * lo tuyo (nota, links por canal, código) no se pierda al actualizar, y sobre
 * todo que NUNCA se guarde solo un link que pudo ser de otro producto.
 */
import { describe, it, expect } from 'vitest';
import { mezclarDelMarcador } from './marcadorEntrada.js';

const AHORA = '2026-11-07T18:00:00.000Z';
const ficha = (extra = {}) => ({
  link: 'https://meli.la/Licuadora1',
  link_origen: 'pagina',
  titulo: 'Licuadora de 10 velocidades con vaso de vidrio',
  precio: 899,
  precio_antes: 1299,
  imagen: 'https://http2.mlstatic.com/D_licuadora.webp',
  url_producto: 'https://www.mercadolibre.com.mx/licuadora/p/MLM123456?pdp_filters=x#reviews',
  rating: 4.7,
  vendidos: 5000,
  envio_gratis: true,
  relampago: false,
  ...extra,
});

describe('mezclarDelMarcador', () => {
  it('un producto completo con el link de la ventanita «Compartir» se guarda solo, arriba', () => {
    const r = mezclarDelMarcador([{ link: 'https://meli.la/Otro', titulo: 'Otro', precio: 10, revisado: AHORA }], ficha(), AHORA);
    expect(r.estado).toBe('agregado');
    expect(r.productos).toHaveLength(2);
    expect(r.productos[0]).toMatchObject({
      link: 'https://meli.la/Licuadora1',
      titulo: 'Licuadora de 10 velocidades con vaso de vidrio',
      precio: 899,
      url_producto: 'https://www.mercadolibre.com.mx/licuadora/p/MLM123456',
      envio_gratis: true,
      revisado: AHORA,
      vistos: [['2026-11-07', 899, 899]],
    });
    expect(r.productos[0]).not.toHaveProperty('relampago');
    expect(r.productos[0]).not.toHaveProperty('link_origen');
  });

  it('el link escrito por ti en el marcador también cuenta como de este producto', () => {
    expect(mezclarDelMarcador([], ficha({ link_origen: 'escrito' }), AHORA).estado).toBe('agregado');
  });

  it('el link del PORTAPAPELES no se guarda solo: pudo ser el del producto anterior', () => {
    expect(mezclarDelMarcador([], ficha({ link_origen: 'portapapeles' }), AHORA)).toEqual({ estado: 'revisar', motivo: 'confirmar-link' });
    expect(mezclarDelMarcador([], ficha({ link_origen: 'texto' }), AHORA).estado).toBe('revisar');
    expect(mezclarDelMarcador([], ficha({ link_origen: undefined }), AHORA).estado).toBe('revisar');
  });

  it('si el link ya es de OTRO producto de tu vitrina, no se guarda (aunque venga de la página)', () => {
    const otro = { link: 'https://meli.la/Licuadora1', titulo: 'Termo 1 L', precio: 349, url_producto: 'https://www.mercadolibre.com.mx/termo/p/MLM999999' };
    const r = mezclarDelMarcador([otro], ficha(), AHORA);
    expect(r.estado).toBe('link-ajeno');
    expect(r.ajeno.titulo).toBe('Termo 1 L');
  });

  it('el mismo producto que pegaste desde la app (sin ficha, mismo título) se completa con su link', () => {
    const desdeApp = { link: 'https://meli.la/Licuadora1', titulo: 'Licuadora de 10 Velocidades con Vaso de Vidrio', precio: 950, revisado: '2026-11-05T18:00:00.000Z', codigo: 4, nota: 'La mejor' };
    const r = mezclarDelMarcador([desdeApp], ficha(), AHORA);
    expect(r.estado).toBe('actualizado');
    expect(r.productos).toHaveLength(1);
    expect(r.productos[0]).toMatchObject({ codigo: 4, nota: 'La mejor', precio: 899, imagen: 'https://http2.mlstatic.com/D_licuadora.webp' });
    expect(r.productos[0].vistos).toEqual([['2026-11-07', 899, 899], ['2026-11-05', 950, 950]]);
  });

  it('el mismo link en un producto sin ficha pero con OTRO título es de otro producto', () => {
    const desdeApp = { link: 'https://meli.la/Licuadora1', titulo: 'Audífonos inalámbricos', precio: 599 };
    expect(mezclarDelMarcador([desdeApp], ficha(), AHORA).estado).toBe('link-ajeno');
  });

  it('actualizar por su ficha conserva lo tuyo y quita la relámpago que ya terminó', () => {
    const antes = {
      link: 'https://meli.la/Licuadora1', titulo: 'Licuadora', precio: 999, revisado: '2026-11-01T18:00:00.000Z',
      url_producto: 'https://www.mercadolibre.com.mx/licuadora/p/MLM123456',
      codigo: 7, nota: 'Rinde mucho', destacado: true, enlaces: { tg: 'https://meli.la/SoloTg' },
      relampago: true, termina: '2026-11-01T23:00:00.000Z',
    };
    const r = mezclarDelMarcador([antes], ficha(), AHORA);
    expect(r.estado).toBe('actualizado');
    expect(r.productos[0]).toMatchObject({ codigo: 7, nota: 'Rinde mucho', destacado: true, enlaces: { tg: 'https://meli.la/SoloTg' }, precio: 899 });
    expect(r.productos[0]).not.toHaveProperty('relampago');
    expect(r.productos[0]).not.toHaveProperty('termina');
  });

  it('sin link oficial, o sin precio, se abre el formulario', () => {
    expect(mezclarDelMarcador([], ficha({ link: '' }), AHORA)).toEqual({ estado: 'revisar', motivo: 'sin-link' });
    expect(mezclarDelMarcador([], ficha({ link: 'https://www.mercadolibre.com.mx/x?matt_tool=1' }), AHORA).motivo).toBe('sin-link');
    expect(mezclarDelMarcador([], ficha({ precio: null }), AHORA)).toMatchObject({ estado: 'revisar', motivo: 'falta el precio' });
  });

  it('no truena con basura', () => {
    expect(mezclarDelMarcador(null, null, AHORA).estado).toBe('revisar');
  });
});
