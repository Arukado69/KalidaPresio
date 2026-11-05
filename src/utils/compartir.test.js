/**
 * Tests del lector de mensajes de «Compartir para ganar una comisión».
 *
 * Lo que se protege: que el link pase TAL CUAL (es el que lleva el
 * identificador de afiliado), que el precio se lea bien con la coma decimal
 * del mensaje («$ 99,59» no son 9,959 pesos), y que un lote pegado de golpe
 * salga producto por producto sin mezclar títulos.
 */
import { describe, it, expect } from 'vitest';
import { precioDeTexto, leerMensajesCompartidos, leerCompartido, traeLinkSinComision, mezclarCompartidos } from './compartir.js';

const MENSAJE = '¡Mira lo que encontré! Playera Polo Hombre Manga Corta Moda Casual Camisa Calidad - $ 99,59 en Mercado Libre. Entra aquí:  https://meli.la/2Gyywqc';

describe('precioDeTexto', () => {
  it('lee la coma decimal del mensaje de compartir', () => {
    expect(precioDeTexto('$ 99,59')).toBe(99.59);
  });

  it('distingue miles de decimales', () => {
    expect(precioDeTexto('$ 1.299')).toBe(1299);
    expect(precioDeTexto('$1,299')).toBe(1299);
    expect(precioDeTexto('1.299,50')).toBe(1299.5);
    expect(precioDeTexto('1,299.50')).toBe(1299.5);
    expect(precioDeTexto('12.345.678')).toBe(12345678);
    expect(precioDeTexto('869')).toBe(869);
    expect(precioDeTexto('99.5')).toBe(99.5);
  });

  it('sin número no hay precio', () => {
    expect(precioDeTexto('gratis')).toBeNull();
    expect(precioDeTexto('')).toBeNull();
    expect(precioDeTexto(null)).toBeNull();
  });
});

describe('leerMensajesCompartidos', () => {
  it('saca título, precio y el link tal cual de un mensaje de la app', () => {
    expect(leerMensajesCompartidos(MENSAJE)).toEqual([{
      link: 'https://meli.la/2Gyywqc',
      titulo: 'Playera Polo Hombre Manga Corta Moda Casual Camisa Calidad',
      precio: 99.59,
    }]);
  });

  it('un lote pegado de golpe sale producto por producto', () => {
    const lote = [
      MENSAJE,
      '¡Mira lo que encontré! Licuadora 10 velocidades - vaso de vidrio - $ 1.899 en Mercado Libre. Entra aquí: https://meli.la/AbC123',
      'Freidora de aire 5 L - $ 1,199.00 en Mercado Libre. Entra aquí: https://mercadolibre.com/sec/1xYz9',
    ].join('\n\n');
    const r = leerMensajesCompartidos(lote);
    expect(r.map((x) => x.link)).toEqual(['https://meli.la/2Gyywqc', 'https://meli.la/AbC123', 'https://mercadolibre.com/sec/1xYz9']);
    expect(r[1]).toMatchObject({ titulo: 'Licuadora 10 velocidades - vaso de vidrio', precio: 1899 });
    expect(r[2]).toMatchObject({ titulo: 'Freidora de aire 5 L', precio: 1199 });
  });

  it('un link solo, sin texto, sale sin título ni precio (el panel pide completarlo)', () => {
    expect(leerMensajesCompartidos('https://meli.la/SoloLink')).toEqual([{ link: 'https://meli.la/SoloLink', titulo: null, precio: null }]);
  });

  it('ignora links que no son oficiales', () => {
    const t = 'Mira https://www.mercadolibre.com.mx/p/MLM123?matt_tool=1 y https://bit.ly/xyz';
    expect(leerMensajesCompartidos(t)).toEqual([]);
  });

  it('el mismo link dos veces cuenta una vez', () => {
    expect(leerMensajesCompartidos(`${MENSAJE}\n${MENSAJE}`)).toHaveLength(1);
  });
});

describe('leerCompartido (lo que llega del menú «Compartir» del celular)', () => {
  const PLAYERA = { link: 'https://meli.la/2Gyywqc', titulo: 'Playera Polo Hombre Manga Corta Moda Casual Camisa Calidad', precio: 99.59 };

  it('el mensaje completo en «texto» (lo normal)', () => {
    expect(leerCompartido({ texto: MENSAJE })).toEqual([PLAYERA]);
  });

  it('un título aparte no ensucia el que ya trae el mensaje', () => {
    expect(leerCompartido({ titulo: 'Mercado Libre', texto: MENSAJE, enlace: '' })).toEqual([PLAYERA]);
  });

  it('el link que llega aparte, en «enlace», se usa una sola vez', () => {
    const sinLink = MENSAJE.replace('https://meli.la/2Gyywqc', '');
    expect(leerCompartido({ texto: sinLink, enlace: 'https://meli.la/2Gyywqc' })).toEqual([PLAYERA]);
    expect(leerCompartido({ texto: MENSAJE, enlace: 'https://meli.la/2Gyywqc' })).toEqual([PLAYERA]);
  });

  it('si el texto es solo el link, el título y el precio salen del «titulo»', () => {
    const r = leerCompartido({ titulo: 'Playera Polo Hombre Manga Corta Moda Casual Camisa Calidad - $ 99,59 en Mercado Libre', texto: 'https://meli.la/2Gyywqc' });
    expect(r).toEqual([PLAYERA]);
  });

  it('solo el link: entra igual, para completarlo después', () => {
    expect(leerCompartido({ enlace: 'https://meli.la/2Gyywqc' })).toEqual([{ link: 'https://meli.la/2Gyywqc', titulo: null, precio: null }]);
  });

  it('nada que leer → lista vacía', () => {
    expect(leerCompartido({})).toEqual([]);
    expect(leerCompartido({ titulo: 'Hola', texto: 'sin links' })).toEqual([]);
  });
});

describe('traeLinkSinComision', () => {
  it('detecta el «Compartir» normal (link de producto, sin tu identificador)', () => {
    expect(traeLinkSinComision('Mira esto https://articulo.mercadolibre.com.mx/MLM-5074744490-playera-_JM')).toBe(true);
  });

  it('no se queja de un link oficial ni de un texto sin links', () => {
    expect(traeLinkSinComision(MENSAJE)).toBe(false);
    expect(traeLinkSinComision('https://mercadolibre.com/sec/1AbCdE')).toBe(false);
    expect(traeLinkSinComision('hola')).toBe(false);
  });
});

describe('mezclarCompartidos', () => {
  const HOY = '2026-11-04T18:00:00.000Z';

  it('lo nuevo entra arriba, en el orden en que lo pegaste', () => {
    const leidos = [
      { link: 'https://meli.la/A', titulo: 'Uno', precio: 10 },
      { link: 'https://meli.la/B', titulo: 'Dos', precio: 20 },
    ];
    const r = mezclarCompartidos([{ link: 'https://meli.la/viejo', titulo: 'Viejo' }], leidos, HOY);
    expect(r.productos.map((p) => p.titulo)).toEqual(['Uno', 'Dos', 'Viejo']);
    expect(r.productos[0]).toEqual({ link: 'https://meli.la/A', titulo: 'Uno', precio: 10, revisado: HOY });
    expect(r).toMatchObject({ nuevos: 2, actualizados: 0, incompletos: 0 });
  });

  it('el mismo link actualiza precio y fecha sin perder la foto, la nota ni el código', () => {
    const antes = [{ link: 'https://meli.la/A', titulo: 'Uno', precio: 10, revisado: '2026-10-01T00:00:00Z', imagen: 'x.jpg', nota: 'buena', codigo: 7 }];
    const r = mezclarCompartidos(antes, [{ link: 'https://meli.la/A', titulo: 'Uno', precio: 8 }], HOY);
    expect(r.productos).toEqual([{ link: 'https://meli.la/A', titulo: 'Uno', precio: 8, revisado: HOY, imagen: 'x.jpg', nota: 'buena', codigo: 7 }]);
    expect(r).toMatchObject({ nuevos: 0, actualizados: 1 });
  });

  it('sin precio no pone fecha de revisión: no hay precio que hayas visto', () => {
    const r = mezclarCompartidos([], [{ link: 'https://meli.la/A', titulo: null, precio: null }], HOY);
    expect(r.productos[0]).toEqual({ link: 'https://meli.la/A' });
    expect(r.incompletos).toBe(1);
  });
});
