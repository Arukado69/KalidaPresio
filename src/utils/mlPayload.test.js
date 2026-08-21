/**
 * Tests del lector de tarjetas de Mercado Libre.
 *
 * ESTE es el módulo cuyo fallo silencioso costó 43 días de feed congelado: ML
 * renombró `reviews` → `review_compacted`, el extractor no lo encontró, dejó
 * `rating = 0` en todos los productos y la guillotina los tiró. El step de CI
 * fallaba sin commitear y la web se quedó sirviendo precios de julio.
 *
 * Los fixtures de abajo son RECORTES REALES del payload de agosto de 2026. Su
 * trabajo no es demostrar que el parser funciona hoy —eso ya se vio en
 * producción— sino que cuando ML vuelva a mover algo, un test diga exactamente
 * qué campo se rompió, en vez de que lo descubra el silencio dos meses después.
 */
import { describe, it, expect } from 'vitest';
import {
  resolverTexto,
  leerRating,
  leerVendidos,
  leerPrecios,
  leerEnvioGratis,
  leerVendedor,
  leerCupon,
  leerTarjeta,
  formatearVendidos,
} from './mlPayload.js';

/** Arma una tarjeta con los componentes que se le pasen. */
const tarjeta = (...components) => ({
  components,
  metadata: { id: 'MLM2577352885', url: 'www.mercadolibre.com.mx/tablet-cubot/p/MLM57589015' },
  pictures: { pictures: [{ id: 'D_926576-MLA95535671172' }] },
});

const REVIEW = {
  type: 'review_compacted',
  review_compacted: {
    text: '{icon_star_fill} {label} {label2}',
    alt_text: 'Calificación 4.7 de 5 estrellas. Más de 1000 productos vendidos.',
    values: [
      { key: 'icon_star_fill', type: 'icon', icon: { key: 'icon_star_fill' } },
      { key: 'label', type: 'label', label: { text: '4.7' } },
      { key: 'label2', type: 'label', label: { text: '| +1000 vendidos' } },
    ],
  },
};

const PRICE = {
  type: 'price',
  price: {
    current_price: { value: 3826, currency: 'MXN' },
    price_labels: [{
      text: '{previous_price}',
      values: [{ type: 'price', key: 'previous_price', price: { value: 5462.54, previous: true } }],
    }],
    discount_polylabel: {
      text: '{previous_label}',
      values: [{ type: 'pill', key: 'previous_label', pill: { text: '29% OFF' } }],
    },
  },
};

const TITLE = { type: 'title', title: { text: 'Tablet Cubot Tab KingKong S 10.1' } };

describe('resolverTexto — el patrón text + values de ML', () => {
  it('sustituye el marcador por el importe formateado', () => {
    // Sin esto se publicaba el literal «Cupón {amount} OFF».
    expect(resolverTexto({
      text: 'Cupón {amount} OFF',
      values: [{ key: 'amount', type: 'price', price: { value: 100, currency: 'MXN' } }],
    })).toBe('Cupón $100 OFF');
  });

  it('descarta iconos y marcadores que no se pueden resolver', () => {
    expect(resolverTexto({ text: '{icon} Envío gratis', values: [{ key: 'icon', type: 'icon' }] }))
      .toBe('Envío gratis');
    expect(resolverTexto({ text: 'Cupón {fantasma} OFF', values: [] })).toBe('Cupón OFF');
  });

  it('deja pasar el texto ya resuelto', () => {
    expect(resolverTexto({ text: 'Cupón 10% OFF' })).toBe('Cupón 10% OFF');
  });

  it('no truena con entradas vacías', () => {
    for (const malo of [null, undefined, {}, { values: [] }]) {
      expect(resolverTexto(malo)).toBe('');
    }
  });
});

describe('leerRating', () => {
  it('lee la calificación del alt_text', () => {
    expect(leerRating(tarjeta(REVIEW))).toBe(4.7);
  });

  it('cae al label suelto si no hay alt_text', () => {
    const sinAlt = { ...REVIEW, review_compacted: { ...REVIEW.review_compacted, alt_text: undefined } };
    expect(leerRating(tarjeta(sinAlt))).toBe(4.7);
  });

  it('devuelve 0 —no null— si el bloque no está', () => {
    // La guillotina del pipeline compara con 0; un null la haría pasar de largo.
    expect(leerRating(tarjeta(PRICE))).toBe(0);
    expect(leerRating(null)).toBe(0);
  });
});

describe('leerVendidos — cotas inferiores, no cifras exactas', () => {
  it('interpreta los cubos que publica ML', () => {
    const con = (alt) => tarjeta({ type: 'review_compacted', review_compacted: { alt_text: alt } });
    expect(leerVendidos(con('Calificación 4.9 de 5 estrellas. Más de 100 productos vendidos.'))).toBe(100);
    expect(leerVendidos(con('Calificación 4.9 de 5 estrellas. Más de 500 productos vendidos.'))).toBe(500);
    expect(leerVendidos(con('Calificación 4.9 de 5 estrellas. Más de 1000 productos vendidos.'))).toBe(1000);
    expect(leerVendidos(con('Calificación 4.9 de 5 estrellas. Más de 5mil productos vendidos.'))).toBe(5000);
    expect(leerVendidos(con('Calificación 4.9 de 5 estrellas. Más de 50mil productos vendidos.'))).toBe(50_000);
    expect(leerVendidos(con('Calificación 4.9 de 5 estrellas. Más de 250mil productos vendidos.'))).toBe(250_000);
  });

  it('también lo saca del label corto', () => {
    const soloLabel = {
      type: 'review_compacted',
      review_compacted: { values: [{ type: 'label', label: { text: '| +10mil vendidos' } }] },
    };
    expect(leerVendidos(tarjeta(soloLabel))).toBe(10_000);
  });

  it('devuelve 0 si la tarjeta no lo trae', () => {
    expect(leerVendidos(tarjeta(PRICE))).toBe(0);
  });
});

describe('leerPrecios', () => {
  it('saca actual, previo y descuento de la estructura nueva', () => {
    expect(leerPrecios(tarjeta(PRICE))).toEqual({ actual: 3826, previo: 5462.54, descuento: 29 });
  });

  it('prefiere la etiqueta de ML sobre el cálculo propio', () => {
    // 3826 sobre 5462.54 daría 30 % redondeando; ML dice 29 % y ese es el que
    // ve el comprador. Discrepar con la plataforma confunde más que ayuda.
    expect(leerPrecios(tarjeta(PRICE)).descuento).toBe(29);
  });

  it('deduce el descuento del precio previo cuando no hay etiqueta', () => {
    const sinPill = { type: 'price', price: { ...PRICE.price, discount_polylabel: undefined } };
    expect(leerPrecios(tarjeta(sinPill)).descuento).toBe(30);
  });

  it('no inventa descuento sin precio previo', () => {
    const soloActual = { type: 'price', price: { current_price: { value: 999 } } };
    expect(leerPrecios(tarjeta(soloActual))).toEqual({ actual: 999, previo: null, descuento: 0 });
  });
});

describe('leerEnvioGratis', () => {
  const envio = (...vals) => tarjeta({ type: 'shipping_v2', shipping_v2: [{ values: vals }] });

  it('reconoce las formas que usa ML', () => {
    expect(leerEnvioGratis(envio({ type: 'label', label: { text: 'Envío gratis' } }))).toBe(true);
    expect(leerEnvioGratis(envio({ type: 'pill', pill: { text: 'Llega gratis mañana' } }))).toBe(true);
  });

  it('«Llega mañana» a secas NO es envío gratis', () => {
    expect(leerEnvioGratis(envio({ type: 'pill', pill: { text: 'Llega mañana' } }))).toBe(false);
  });

  it('sin bloque de envío, false', () => {
    expect(leerEnvioGratis(tarjeta(PRICE))).toBe(false);
  });
});

describe('leerVendedor', () => {
  const seller = (text) => tarjeta({ type: 'seller', seller: { text } });

  it('limpia los tokens de icono y el «por» inicial', () => {
    expect(leerVendedor(seller('{label} por Selectshop MX {icon_cockade}')))
      .toEqual({ nombre: 'Selectshop MX', confiable: true });
    expect(leerVendedor(seller('Cubot {icon_cockade}')))
      .toEqual({ nombre: 'Cubot', confiable: true });
  });

  it('detecta la ausencia del icono de reputación', () => {
    expect(leerVendedor(seller('Tienda cualquiera')).confiable).toBe(false);
  });

  it('un texto que era solo tokens deja el nombre en null', () => {
    expect(leerVendedor(seller('{label} {icon_cockade}')).nombre).toBeNull();
  });
});

describe('leerCupon', () => {
  const promo = (p) => tarjeta({ type: 'promotions', promotions: [p] });

  it('lee el cupón ya resuelto y el que trae marcador', () => {
    expect(leerCupon(promo({ type: 'coupon', text: 'Cupón 10% OFF' }))).toBe('Cupón 10% OFF');
    expect(leerCupon(promo({
      type: 'coupon',
      text: 'Cupón {amount} OFF',
      values: [{ key: 'amount', type: 'price', price: { value: 100 } }],
    }))).toBe('Cupón $100 OFF');
  });

  it('null cuando no hay cupón', () => {
    expect(leerCupon(tarjeta(PRICE))).toBeNull();
  });
});

describe('leerTarjeta — el shape canónico del feed', () => {
  it('arma el item completo', () => {
    const item = { card: tarjeta(TITLE, REVIEW, PRICE, { type: 'seller', seller: { text: 'Cubot {icon_cockade}' } }) };
    const r = leerTarjeta(item, (u) => `${u}?matt_tool=X`);

    expect(r).toMatchObject({
      id: 'MLM2577352885',
      titulo: 'Tablet Cubot Tab KingKong S 10.1',
      precio_actual: 3826,
      precio_previo: 5462.54,
      descuento: 29,
      rating: 4.7,
      vendidos: 1000,
      vendedor: 'Cubot',
      vendedor_confiable: true,
      envio_gratis: false,
      cupon: null,
      fin_oferta: null,   // ML dejó de publicar el countdown
    });
    expect(r.link_afiliado).toContain('matt_tool=X');
    expect(r.link_afiliado.startsWith('https://')).toBe(true);
  });

  it('descarta la tarjeta si le falta lo mínimo, en vez de colar un hueco', () => {
    expect(leerTarjeta({ card: tarjeta(REVIEW) })).toBeNull();        // sin título ni precio
    expect(leerTarjeta({ card: tarjeta(TITLE, REVIEW) })).toBeNull(); // sin precio
    expect(leerTarjeta({})).toBeNull();
    expect(leerTarjeta(null)).toBeNull();
  });
});

describe('formatearVendidos — el copy no debe fingir precisión', () => {
  it('siempre lleva el «+», porque el dato es una cota inferior', () => {
    expect(formatearVendidos(500)).toBe('+500 vendidos');
    expect(formatearVendidos(1200)).toBe('+1.2 mil vendidos');
    expect(formatearVendidos(5000)).toBe('+5 mil vendidos');
    expect(formatearVendidos(50_000)).toBe('+50 mil vendidos');
  });

  it('sin dato, cadena vacía (no «0 vendidos»)', () => {
    expect(formatearVendidos(0)).toBe('');
    expect(formatearVendidos(null)).toBe('');
    expect(formatearVendidos(undefined)).toBe('');
  });
});
