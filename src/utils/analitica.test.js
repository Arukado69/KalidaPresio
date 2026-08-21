/**
 * Tests de la instrumentación de clics salientes.
 *
 * Lo que se protege aquí es la correspondencia entre la `seccion` que reporta
 * Umami y el sufijo de `matt_word` que registra Mercado Libre. Si esa
 * correspondencia se rompe, las dos mitades del embudo dejan de cruzarse y los
 * datos pasan a mentir en silencio — que es peor que no tenerlos.
 */
import { describe, it, expect } from 'vitest';
import {
  esEnlaceSaliente,
  seccionDesdeHref,
  idDesdeHref,
  datosDelClic,
} from './analitica.js';
import { aLinkAfiliado } from './afiliado.js';

const CATALOGO = 'https://www.mercadolibre.com.mx/bocina-portatil-aiwa/p/MLM19045710';
const ARTICULO = 'https://articulo.mercadolibre.com.mx/MLM-2232004575-bota-trabajo-mujer-_JM';

describe('esEnlaceSaliente', () => {
  it('reconoce Mercado Libre y sus subdominios', () => {
    expect(esEnlaceSaliente(CATALOGO)).toBe(true);
    expect(esEnlaceSaliente(ARTICULO)).toBe(true);
    expect(esEnlaceSaliente('https://mercadolibre.com.mx/x')).toBe(true);
  });

  it('reconoce el cloaking propio', () => {
    expect(esEnlaceSaliente('/recomienda/MLM4568402546')).toBe(true);
  });

  it('ignora la navegación interna', () => {
    for (const interno of ['/', '/blog', '/colecciones/gangas-bajo-300', '/privacidad']) {
      expect(esEnlaceSaliente(interno)).toBe(false);
    }
  });

  it('no se deja engañar por un dominio que solo termina parecido', () => {
    // El regex ancla en límite de subdominio: nada de "mercadolibre.com.mx.evil.com"
    expect(esEnlaceSaliente('https://mercadolibre.com.mx.evil.com/x')).toBe(false);
    expect(esEnlaceSaliente('https://notmercadolibre.com.mx/x')).toBe(false);
  });

  it('descarta esquemas que no son http(s) y entradas basura', () => {
    expect(esEnlaceSaliente('javascript:alert(1)')).toBe(false);
    expect(esEnlaceSaliente('mailto:hola@kalidapresio.com')).toBe(false);
    for (const malo of [null, undefined, '', 42, {}]) {
      expect(esEnlaceSaliente(malo)).toBe(false);
    }
  });
});

describe('seccionDesdeHref — el puente con el panel de afiliados de ML', () => {
  it('lee la campaña que puso aLinkAfiliado', () => {
    // Este es EL test que importa: lo que genera el sitio es lo que lee la
    // analítica. Si aLinkAfiliado cambia de formato, esto se cae.
    for (const seccion of ['imbatibles', 'relampago', 'bento', 'showpiece', 'elegidos']) {
      expect(seccionDesdeHref(aLinkAfiliado(CATALOGO, seccion))).toBe(seccion);
    }
  });

  it('devuelve null cuando el enlace no lleva campaña', () => {
    expect(seccionDesdeHref(aLinkAfiliado(CATALOGO))).toBeNull();
    expect(seccionDesdeHref(CATALOGO)).toBeNull();
  });

  it('corta por el ÚLTIMO guion bajo, para no romperse si el matt_word base lleva uno', () => {
    expect(seccionDesdeHref(`${CATALOGO}?matt_word=base_con_guion_imbatibles`)).toBe('imbatibles');
  });

  it('no truena con entradas inservibles', () => {
    for (const malo of [null, undefined, '', 42]) {
      expect(seccionDesdeHref(malo)).toBeNull();
    }
    expect(seccionDesdeHref(`${CATALOGO}?matt_word=singuionbajo`)).toBeNull();
  });
});

describe('idDesdeHref', () => {
  it('extrae el id de las tres formas que produce el feed', () => {
    expect(idDesdeHref(CATALOGO)).toBe('MLM19045710');
    expect(idDesdeHref(ARTICULO)).toBe('MLM2232004575');          // normaliza el guion
    expect(idDesdeHref('/recomienda/MLM4568402546')).toBe('MLM4568402546');
  });

  it('ignora la query: matt_word trae dígitos que despistarían', () => {
    expect(idDesdeHref(aLinkAfiliado(CATALOGO, 'relampago'))).toBe('MLM19045710');
  });

  it('devuelve null si no hay id', () => {
    expect(idDesdeHref('https://www.mercadolibre.com.mx/ofertas')).toBeNull();
    expect(idDesdeHref(null)).toBeNull();
  });
});

describe('datosDelClic', () => {
  it('arma el evento completo a partir del enlace y los data-* de la tarjeta', () => {
    const href = aLinkAfiliado(CATALOGO, 'imbatibles');
    expect(datosDelClic(href, {
      precio: '849', score: '97', descuento: '49', categoria: 'Tecnología', posicion: '3',
    })).toEqual({
      seccion: 'imbatibles',
      id: 'MLM19045710',
      precio: 849,
      score: 97,
      descuento: 49,
      categoria: 'Tecnología',
      posicion: 3,
      destino: 'directo',
    });
  });

  it('marca "sin-etiqueta" cuando el CTA no lleva campaña — es una sonda, no un adorno', () => {
    // Si esto aparece en el panel, hay un enlace sin instrumentar en el sitio.
    expect(datosDelClic(CATALOGO).seccion).toBe('sin-etiqueta');
  });

  it('prefiere la campaña del href sobre la marca del DOM', () => {
    // El href es la fuente de verdad: es lo que ML registra de verdad.
    const href = aLinkAfiliado(CATALOGO, 'relampago');
    expect(datosDelClic(href, { seccion: 'otra-cosa' }).seccion).toBe('relampago');
  });

  it('distingue el clic directo del que pasa por el cloaking', () => {
    expect(datosDelClic('/recomienda/MLM4568402546').destino).toBe('recomienda');
    expect(datosDelClic(CATALOGO).destino).toBe('directo');
  });

  it('convierte a número lo numérico y deja null lo que no lo es', () => {
    const d = datosDelClic(CATALOGO, { precio: 'no-es-un-precio', score: '', descuento: '0' });
    expect(d.precio).toBeNull();
    expect(d.score).toBeNull();
    expect(d.descuento).toBe(0); // un 0 real NO es lo mismo que ausente
  });

  it('sobrevive a una tarjeta sin ningún data-*', () => {
    const d = datosDelClic(aLinkAfiliado(ARTICULO, 'bento'));
    expect(d.seccion).toBe('bento');
    expect(d.id).toBe('MLM2232004575');
    expect(d.precio).toBeNull();
    expect(d.categoria).toBeNull();
  });
});
