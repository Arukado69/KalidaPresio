/**
 * Tests de la instrumentación de clics salientes.
 *
 * Lo que se protege aquí: que un clic hacia un link OFICIAL (meli.la/…,
 * mercadolibre.com/sec/…) se cuente como clic de compra, y que la sección
 * salga del atributo `data-kp-seccion` — nunca de algo pegado al link, que es
 * lo que rompía la atribución en Mercado Libre.
 */
import { describe, it, expect } from 'vitest';
import { esEnlaceSaliente, idDesdeHref, datosDelClic } from './analitica.js';

const CATALOGO = 'https://www.mercadolibre.com.mx/bocina-portatil-aiwa/p/MLM19045710';
const ARTICULO = 'https://articulo.mercadolibre.com.mx/MLM-2232004575-bota-trabajo-mujer-_JM';
const CORTO = 'https://meli.la/1AbCdE';
const SEC = 'https://mercadolibre.com/sec/2Xr7fQk';

describe('esEnlaceSaliente', () => {
  it('reconoce los links cortos oficiales de afiliado', () => {
    expect(esEnlaceSaliente(CORTO)).toBe(true);
    expect(esEnlaceSaliente(SEC)).toBe(true);
    expect(esEnlaceSaliente('https://www.mercadolibre.com.mx/sec/2Xr7fQk')).toBe(true);
  });

  it('reconoce Mercado Libre y sus subdominios', () => {
    expect(esEnlaceSaliente(CATALOGO)).toBe(true);
    expect(esEnlaceSaliente(ARTICULO)).toBe(true);
    expect(esEnlaceSaliente('https://mercadolibre.com.mx/x')).toBe(true);
  });

  it('sigue contando las redirecciones viejas que aún andan publicadas', () => {
    expect(esEnlaceSaliente('/recomienda/MLM4568402546')).toBe(true);
    expect(esEnlaceSaliente('/r/tg/MLM4568402546')).toBe(true);
  });

  it('ignora la navegación interna', () => {
    for (const interno of ['/', '/hoy', '/colecciones/gangas-bajo-300', '/privacidad']) {
      expect(esEnlaceSaliente(interno)).toBe(false);
    }
  });

  it('no se deja engañar por un dominio que solo termina parecido', () => {
    expect(esEnlaceSaliente('https://mercadolibre.com.mx.evil.com/x')).toBe(false);
    expect(esEnlaceSaliente('https://notmercadolibre.com.mx/x')).toBe(false);
    expect(esEnlaceSaliente('https://meli.la.evil.com/x')).toBe(false);
    expect(esEnlaceSaliente('https://evilmeli.la/x')).toBe(false);
  });

  it('descarta esquemas que no son http(s) y entradas basura', () => {
    expect(esEnlaceSaliente('javascript:alert(1)')).toBe(false);
    expect(esEnlaceSaliente('mailto:hola@kalidapresio.com')).toBe(false);
    for (const malo of [null, undefined, '', 42, {}]) {
      expect(esEnlaceSaliente(malo)).toBe(false);
    }
  });
});

describe('idDesdeHref', () => {
  it('extrae el id de las URLs de Mercado Libre', () => {
    expect(idDesdeHref(CATALOGO)).toBe('MLM19045710');
    expect(idDesdeHref(ARTICULO)).toBe('MLM2232004575');          // normaliza el guion
    expect(idDesdeHref('/recomienda/MLM4568402546')).toBe('MLM4568402546');
  });

  it('un link corto no lleva id (para eso está data-ml-id)', () => {
    expect(idDesdeHref(CORTO)).toBeNull();
  });

  it('devuelve null si no hay id', () => {
    expect(idDesdeHref('https://www.mercadolibre.com.mx/ofertas')).toBeNull();
    expect(idDesdeHref(null)).toBeNull();
  });
});

describe('datosDelClic', () => {
  it('arma el evento completo a partir del link oficial y los data-* de la tarjeta', () => {
    expect(datosDelClic(CORTO, {
      seccion: 'catalogo', id: 'MLM19045710', precio: '849', score: '97', descuento: '49',
      categoria: 'Tecnología', posicion: '3',
    })).toEqual({
      seccion: 'catalogo',
      canal: 'wb',
      id: 'MLM19045710',
      precio: 849,
      score: 97,
      descuento: 49,
      categoria: 'Tecnología',
      posicion: 3,
      destino: 'meli.la',
    });
  });

  it('marca "sin-etiqueta" cuando el CTA no lleva data-kp-seccion — es una sonda, no un adorno', () => {
    expect(datosDelClic(CORTO).seccion).toBe('sin-etiqueta');
  });

  it('distingue el tipo de destino', () => {
    expect(datosDelClic(CORTO).destino).toBe('meli.la');
    expect(datosDelClic(SEC).destino).toBe('sec');
    expect(datosDelClic('/recomienda/MLM4568402546').destino).toBe('recomienda');
    expect(datosDelClic('/r/tg/MLM4568402546').destino).toBe('corto');
    expect(datosDelClic(CATALOGO).destino).toBe('directo');
  });

  it('toma el canal marcado (p. ej. /hoy?c=ig) y degrada lo desconocido al sitio', () => {
    expect(datosDelClic(CORTO, { canal: 'ig' }).canal).toBe('ig');
    expect(datosDelClic(CORTO, { canal: 'zz' }).canal).toBe('wb');
    expect(datosDelClic(CORTO).canal).toBe('wb');
  });

  it('lee el canal de la ruta vieja /r/<canal>/<id>', () => {
    const d = datosDelClic('/r/tg/MLM4568402546');
    expect(d.canal).toBe('tg');
    expect(d.id).toBe('MLM4568402546');
  });

  it('convierte a número lo numérico y deja null lo que no lo es', () => {
    const d = datosDelClic(CORTO, { precio: 'no-es-un-precio', score: '', descuento: '0' });
    expect(d.precio).toBeNull();
    expect(d.score).toBeNull();
    expect(d.descuento).toBe(0); // un 0 real NO es lo mismo que ausente
  });
});
