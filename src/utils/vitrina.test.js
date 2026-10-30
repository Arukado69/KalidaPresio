/**
 * Tests de la vitrina — la puerta por la que entra cada link que cobra.
 *
 * Lo que se protege aquí es la regla que motivó todo el cambio: el sitio solo
 * publica links cortos oficiales del generador, tal cual se pegaron. Si una URL
 * de producto con `matt_tool` pudiera colarse, volveríamos exactamente al
 * estado en que una compra real no generó comisión.
 */
import { describe, it, expect } from 'vitest';
import {
  esLinkOficial,
  claveProducto,
  urlProductoLimpia,
  idArticulo,
  clavesObservacion,
  normalizarProducto,
  cargarVitrina,
  enlacePara,
  revisionMasVieja,
  ordenParaPublicar,
  DIAS_VIGENCIA_PRECIO,
  HORAS_RELAMPAGO_SIN_FIN,
} from './vitrina.js';

const AHORA = Date.parse('2026-10-26T18:00:00Z');
const HORA = 3_600_000;

const base = (extra = {}) => ({
  link: 'https://meli.la/1AbCdE',
  titulo: 'Hidrolavadora eléctrica 1600 PSI',
  precio: 869,
  precio_antes: 2299,
  revisado: '2026-10-26T15:00:00Z',
  url_producto: 'https://www.mercadolibre.com.mx/hidrolavadora/p/MLM53177027?pdp_filters=x#reviews',
  rating: 4.8,
  vendidos: 250000,
  ...extra,
});

describe('esLinkOficial', () => {
  it('acepta las dos formas cortas del generador', () => {
    expect(esLinkOficial('https://meli.la/1AbCdE')).toBe(true);
    expect(esLinkOficial('https://mercadolibre.com/sec/2Xr7fQk')).toBe(true);
    expect(esLinkOficial('https://www.mercadolibre.com.mx/sec/2Xr7fQk')).toBe(true);
    expect(esLinkOficial('  https://meli.la/1AbCdE  ')).toBe(true);
  });

  it('RECHAZA la URL de producto con matt_tool/matt_word: es la forma de los links armados a mano', () => {
    expect(esLinkOficial(
      'https://www.mercadolibre.com.mx/hidrolavadora/p/MLM53177027?matt_tool=68549198&matt_word=ci20241127172754',
    )).toBe(false);
    expect(esLinkOficial('https://www.mercadolibre.com.mx/hidrolavadora/p/MLM53177027')).toBe(false);
  });

  it('no se deja engañar por dominios parecidos', () => {
    expect(esLinkOficial('https://meli.la.evil.com/1AbCdE')).toBe(false);
    expect(esLinkOficial('https://evilmeli.la/1AbCdE')).toBe(false);
    expect(esLinkOficial('https://mercadolibre.com.evil.com/sec/2Xr7fQk')).toBe(false);
  });

  it('exige https, un código y nada de espacios', () => {
    expect(esLinkOficial('http://meli.la/1AbCdE')).toBe(false);
    expect(esLinkOficial('https://meli.la/')).toBe(false);
    expect(esLinkOficial('https://mercadolibre.com/sec/')).toBe(false);
    expect(esLinkOficial('https://meli.la/1Ab CdE')).toBe(false);
    for (const malo of [null, undefined, '', 42, {}, 'meli.la/1AbCdE']) {
      expect(esLinkOficial(malo)).toBe(false);
    }
  });
});

describe('claveProducto y urlProductoLimpia', () => {
  it('prefiere el id de catálogo y lo deja en forma canónica', () => {
    expect(claveProducto('https://www.mercadolibre.com.mx/x/p/MLM53177027?item_id=MLM999999999')).toBe('MLM53177027');
    expect(claveProducto('https://articulo.mercadolibre.com.mx/MLM-1932698151-hidro-_JM')).toBe('MLM1932698151');
    expect(claveProducto('https://meli.la/1AbCdE')).toBeNull();
    expect(claveProducto(null)).toBeNull();
  });

  it('limpia la URL de producto y solo acepta Mercado Libre México', () => {
    expect(urlProductoLimpia('https://www.mercadolibre.com.mx/x/p/MLM53177027?matt_tool=1#a'))
      .toBe('https://www.mercadolibre.com.mx/x/p/MLM53177027');
    expect(urlProductoLimpia('https://evil.com/p/MLM53177027')).toBeNull();
    expect(urlProductoLimpia('no es url')).toBeNull();
  });
});

// El histórico de precios se llenó con ids de ARTÍCULO y la vitrina identifica
// por CATÁLOGO. Hasta octubre de 2026 nadie cruzaba las dos claves: ningún
// producto de la vitrina encontraba su historia y el veredicto salía siempre
// «sin datos», en silencio.
describe('el cruce de ids: artículo y catálogo', () => {
  it('idArticulo lee el artículo que viaja en una ficha de catálogo', () => {
    expect(idArticulo('https://www.mercadolibre.com.mx/x/p/MLM53177027#polycard_client=search&wid=MLM1932698151&sid=s'))
      .toBe('MLM1932698151');
    expect(idArticulo('https://www.mercadolibre.com.mx/x/p/MLM53177027?pdp_filters=item_id%3AMLM1932698151'))
      .toBe('MLM1932698151');
    expect(idArticulo('https://www.mercadolibre.com.mx/x/p/MLM53177027?item_id=MLM-1932698151'))
      .toBe('MLM1932698151');
    expect(idArticulo('https://articulo.mercadolibre.com.mx/MLM-1932698151-hidro-_JM')).toBe('MLM1932698151');
  });

  it('idArticulo NO confunde el catálogo con un artículo, ni lee el de otro parámetro', () => {
    expect(idArticulo('https://www.mercadolibre.com.mx/x/p/MLM53177027')).toBeNull();
    expect(idArticulo('https://www.mercadolibre.com.mx/x/p/MLM53177027?parent_item_id=MLM1932698151')).toBeNull();
    expect(idArticulo('https://meli.la/1AbCdE')).toBeNull();
    expect(idArticulo('%E0%A4%A')).toBeNull();
    expect(idArticulo(null)).toBeNull();
  });

  it('clavesObservacion guarda una tarjeta de catálogo con las dos claves, sin repetir', () => {
    expect(clavesObservacion('MLM1932698151', 'https://www.mercadolibre.com.mx/x/p/MLM53177027'))
      .toEqual(['MLM1932698151', 'MLM53177027']);
    expect(clavesObservacion('MLM1932698151', 'https://articulo.mercadolibre.com.mx/MLM-1932698151-hidro-_JM'))
      .toEqual(['MLM1932698151']);
    expect(clavesObservacion('no-es-id', 'https://www.mercadolibre.com.mx/x/p/MLM53177027')).toEqual(['MLM53177027']);
    expect(clavesObservacion(null, null)).toEqual([]);
  });

  it('el producto lleva sus dos claves para buscar el histórico', () => {
    const r = normalizarProducto(base({ id_articulo: ' mlm-1932698151 ' }), AHORA);
    expect(r.producto.id).toBe('MLM53177027');
    expect(r.producto.id_articulo).toBe('MLM1932698151');
    expect(r.producto.claves_historico).toEqual(['MLM53177027', 'MLM1932698151']);
    expect(r.avisos).toEqual([]);
  });

  it('sin id_articulo, lo saca de la URL tal como se pegó (antes de limpiarla)', () => {
    const r = normalizarProducto(base({
      url_producto: 'https://www.mercadolibre.com.mx/hidrolavadora/p/MLM53177027#wid=MLM1932698151',
    }), AHORA);
    expect(r.producto.url_producto).toBe('https://www.mercadolibre.com.mx/hidrolavadora/p/MLM53177027');
    expect(r.producto.claves_historico).toEqual(['MLM53177027', 'MLM1932698151']);
  });

  it('un id_articulo que no es de ML se avisa y no se usa; el producto se publica igual', () => {
    const r = normalizarProducto(base({ id_articulo: 'ABC123' }), AHORA);
    expect(r.producto.claves_historico).toEqual(['MLM53177027']);
    expect(r.producto.id_articulo).toBeNull();
    expect(r.avisos.join(' ')).toMatch(/id_articulo/);
  });
});

describe('normalizarProducto', () => {
  it('arma el shape canónico con el link tal cual se pegó', () => {
    const r = normalizarProducto(base(), AHORA);
    expect(r.producto).toMatchObject({
      id: 'MLM53177027',
      titulo: 'Hidrolavadora eléctrica 1600 PSI',
      precio_actual: 869,
      precio_previo: 2299,
      descuento: 62,
      link_afiliado: 'https://meli.la/1AbCdE',
      url_producto: 'https://www.mercadolibre.com.mx/hidrolavadora/p/MLM53177027',
      oferta_relampago: false,
      caduca: null,
    });
    expect(r.producto.score_kalidad_presio).toBeGreaterThan(80);
  });

  it('explica por qué no publica, en vez de tronar', () => {
    expect(normalizarProducto(base({ link: undefined }), AHORA).motivo).toMatch(/falta el link/);
    expect(normalizarProducto(base({ link: 'https://www.mercadolibre.com.mx/p/MLM1?matt_tool=1' }), AHORA).motivo)
      .toMatch(/no es un link corto oficial/);
    expect(normalizarProducto(base({ titulo: '  ' }), AHORA).motivo).toMatch(/título/);
    expect(normalizarProducto(base({ precio: 0 }), AHORA).motivo).toMatch(/precio/);
    expect(normalizarProducto(base({ revisado: 'ayer' }), AHORA).motivo).toMatch(/revisado/);
  });

  it(`esconde un precio sin revisar en más de ${DIAS_VIGENCIA_PRECIO} días`, () => {
    const viejo = new Date(AHORA - (DIAS_VIGENCIA_PRECIO * 24 + 1) * HORA).toISOString();
    expect(normalizarProducto(base({ revisado: viejo }), AHORA).motivo).toMatch(/sin revisarse/);
  });

  it('ignora un precio anterior que no es mayor que el actual', () => {
    const { producto } = normalizarProducto(base({ precio_antes: 500 }), AHORA);
    expect(producto.precio_previo).toBeNull();
    expect(producto.descuento).toBe(0);
  });

  it('acepta precios escritos como texto', () => {
    const { producto } = normalizarProducto(base({ precio: '$1,299', precio_antes: '2,000' }), AHORA);
    expect(producto.precio_actual).toBe(1299);
    expect(producto.precio_previo).toBe(2000);
  });

  it('sin URL de producto, el id sale del código del link', () => {
    const { producto } = normalizarProducto(base({ url_producto: undefined }), AHORA);
    expect(producto.id).toBe('kp-1AbCdE');
  });
});

describe('relámpago', () => {
  it('con hora de fin real: se respeta y se publica hasta entonces', () => {
    const { producto } = normalizarProducto(base({ relampago: true, termina: '2026-10-26T23:00:00Z' }), AHORA);
    expect(producto.oferta_relampago).toBe(true);
    expect(producto.fin_oferta).toBe('2026-10-26T23:00:00.000Z');
    expect(producto.caduca).toBe('2026-10-26T23:00:00.000Z');
  });

  it('ya terminada: no se publica', () => {
    expect(normalizarProducto(base({ relampago: true, termina: '2026-10-26T17:00:00Z' }), AHORA).motivo)
      .toMatch(/ya terminó/);
  });

  it(`sin hora de fin: NO inventa cuenta regresiva y se retira a las ${HORAS_RELAMPAGO_SIN_FIN} h`, () => {
    const { producto } = normalizarProducto(base({ relampago: true }), AHORA);
    expect(producto.fin_oferta).toBeNull();
    expect(producto.caduca).toBe(new Date(Date.parse('2026-10-26T15:00:00Z') + HORAS_RELAMPAGO_SIN_FIN * HORA).toISOString());
    const tarde = Date.parse('2026-10-26T15:00:00Z') + (HORAS_RELAMPAGO_SIN_FIN + 1) * HORA;
    expect(normalizarProducto(base({ relampago: true }), tarde).motivo).toMatch(/ya terminó/);
  });
});

describe('enlaces por canal', () => {
  it('guarda solo los links oficiales de canales conocidos, y avisa del resto', () => {
    const r = normalizarProducto(base({
      enlaces: {
        wa: 'https://meli.la/WaWaWa',
        tg: 'https://www.mercadolibre.com.mx/p/MLM1?matt_tool=1',
        zz: 'https://meli.la/ZzZzZz',
      },
    }), AHORA);
    expect(r.producto.enlaces).toEqual({ wa: 'https://meli.la/WaWaWa' });
    expect(r.avisos).toHaveLength(2);
  });

  it('enlacePara usa el del canal si existe y si no el general', () => {
    const { producto } = normalizarProducto(base({ enlaces: { wa: 'https://meli.la/WaWaWa' } }), AHORA);
    expect(enlacePara(producto, 'wa')).toBe('https://meli.la/WaWaWa');
    expect(enlacePara(producto, 'tg')).toBe('https://meli.la/1AbCdE');
    expect(enlacePara(producto)).toBe('https://meli.la/1AbCdE');
  });
});

describe('cargarVitrina', () => {
  it('separa publicables de descartados, sin tronar', () => {
    const r = cargarVitrina({
      productos: [
        base(),
        base({ link: 'https://www.mercadolibre.com.mx/p/MLM1?matt_tool=1&matt_word=x' }),
        base({ link: 'https://meli.la/OtroOtro' }), // mismo producto (mismo id de catálogo)
        null,
      ],
    }, AHORA);
    expect(r.productos).toHaveLength(1);
    expect(r.descartes.map((d) => d.indice)).toEqual([1, 2, 3]);
    expect(r.descartes[1].motivo).toMatch(/repetido/);
  });

  it('acepta un array pelón y una vitrina vacía', () => {
    expect(cargarVitrina([base()], AHORA).productos).toHaveLength(1);
    expect(cargarVitrina({ productos: [] }, AHORA).productos).toEqual([]);
    expect(cargarVitrina(null, AHORA).productos).toEqual([]);
  });
});

describe('revisionMasVieja y ordenParaPublicar', () => {
  it('anuncia la revisión más vieja, no la más reciente', () => {
    expect(revisionMasVieja([
      { revisado: '2026-10-26T10:00:00Z' },
      { revisado: '2026-10-22T10:00:00Z' },
      {},
    ])).toBe('2026-10-22T10:00:00.000Z');
    expect(revisionMasVieja([])).toBeNull();
  });

  it('relámpago primero (la que termina antes), luego destacados, luego Sello K-P', () => {
    const p = (id, extra) => ({ id, score_kalidad_presio: 50, descuento: 0, ...extra });
    const orden = ordenParaPublicar([
      p('normal-alto', { score_kalidad_presio: 99 }),
      p('destacado', { destacado: 'Elegido' }),
      p('relampago-tarde', { oferta_relampago: true, caduca: '2026-10-27T00:00:00Z' }),
      p('relampago-pronto', { oferta_relampago: true, caduca: '2026-10-26T20:00:00Z' }),
      p('normal-bajo', { score_kalidad_presio: 10 }),
    ]).map((x) => x.id);
    expect(orden).toEqual(['relampago-pronto', 'relampago-tarde', 'destacado', 'normal-alto', 'normal-bajo']);
  });
});
