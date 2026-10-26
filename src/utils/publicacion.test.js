/**
 * Tests de las plantillas de publicación.
 *
 * Lo que se protege: que cada red reciba el link OFICIAL correcto (el de su
 * canal si existe), que Instagram y TikTok no lleven un link que no se puede
 * tocar, y que ninguna publicación salga sin el aviso de afiliado.
 */
import { describe, it, expect } from 'vitest';
import {
  FORMATOS,
  textoProducto,
  textoPaquete,
  cuandoTermina,
  recortar,
  ideaVideo,
  repartirEnHorarios,
  HORARIOS_SUGERIDOS,
} from './publicacion.js';

const AHORA = Date.parse('2026-10-26T18:00:00Z'); // 12:00 en CDMX

const producto = (extra = {}) => ({
  id: 'MLM53177027',
  titulo: 'Hidrolavadora Eléctrica Portátil 1600 Psi 1200w Alta Presión',
  precio_actual: 869,
  precio_previo: 2299,
  descuento: 62,
  rating: 4.8,
  vendidos: 250000,
  envio_gratis: true,
  link_afiliado: 'https://meli.la/General',
  enlaces: { wa: 'https://meli.la/SoloWhatsApp' },
  oferta_relampago: false,
  fin_oferta: null,
  revisado: '2026-10-26T15:00:00Z',
  nota: null,
  ...extra,
});

describe('textoProducto', () => {
  it('usa el link del canal si lo generaste con su etiqueta, y si no el general', () => {
    expect(textoProducto('wa', producto(), { ahora: AHORA })).toContain('https://meli.la/SoloWhatsApp');
    expect(textoProducto('estado', producto(), { ahora: AHORA })).toContain('https://meli.la/SoloWhatsApp');
    expect(textoProducto('tg', producto(), { ahora: AHORA })).toContain('https://meli.la/General');
    expect(textoProducto('fb', producto(), { ahora: AHORA })).toContain('https://meli.la/General');
  });

  it('respeta el formato de cada red', () => {
    expect(textoProducto('wa', producto(), { ahora: AHORA })).toContain('~$2,299~');
    expect(textoProducto('tg', producto(), { ahora: AHORA })).toContain('~~$2,299~~');
    expect(textoProducto('fb', producto(), { ahora: AHORA })).not.toMatch(/\*|~/);
  });

  it('Instagram y TikTok no llevan el link de compra: apuntan a /hoy con el número', () => {
    for (const f of ['ig', 'tt']) {
      const t = textoProducto(f, producto(), { numero: 3, sitio: 'https://kp.mx/', ahora: AHORA });
      expect(t).not.toContain('meli.la');
      expect(t).toContain('#3');
      expect(t).toContain('https://kp.mx/hoy');
      expect(t).toContain('#publicidad');
    }
  });

  it('NINGUNA publicación sale sin el aviso de afiliado', () => {
    for (const { id } of FORMATOS) {
      expect(textoProducto(id, producto(), { ahora: AHORA }).toLowerCase()).toMatch(/afiliado/);
    }
  });

  it('anuncia la hora de fin solo cuando es real', () => {
    const conFin = producto({ oferta_relampago: true, fin_oferta: '2026-10-27T05:00:00Z' }); // 23:00 CDMX
    expect(textoProducto('wa', conFin, { ahora: AHORA })).toContain('Termina hoy a las 23:00');
    const sinFin = producto({ oferta_relampago: true, fin_oferta: null });
    expect(textoProducto('wa', sinFin, { ahora: AHORA })).not.toContain('Termina');
    expect(textoProducto('wa', sinFin, { ahora: AHORA })).toContain('RELÁMPAGO');
  });

  it('incluye tu nota cuando la hay', () => {
    expect(textoProducto('wa', producto({ nota: 'La uso cada semana' }), { ahora: AHORA })).toContain('La uso cada semana');
  });
});

describe('textoPaquete', () => {
  const lote = [
    producto(),
    producto({ id: 'B', titulo: 'Bocina Aiwa', precio_actual: 849, precio_previo: null, descuento: 0, enlaces: {} }),
  ];

  it('junta varias ofertas con su link oficial', () => {
    const t = textoPaquete('wa', lote, { ahora: AHORA });
    expect(t).toContain('1. ');
    expect(t).toContain('2. ');
    expect(t).toContain('https://meli.la/SoloWhatsApp');
    expect(t).toContain('https://meli.la/General');
    expect(t.toLowerCase()).toContain('afiliado');
  });

  it('en Instagram es una lista numerada sin links de compra', () => {
    const t = textoPaquete('ig', lote, { sitio: 'https://kp.mx', ahora: AHORA });
    expect(t).toContain('#1');
    expect(t).toContain('#2');
    expect(t).not.toContain('meli.la');
    expect(t).toContain('https://kp.mx/hoy');
  });

  it('vacío si no hay productos', () => {
    expect(textoPaquete('wa', [], { ahora: AHORA })).toBe('');
  });
});

describe('utilidades', () => {
  it('cuandoTermina habla en hora de CDMX', () => {
    expect(cuandoTermina('2026-10-27T05:00:00Z', AHORA)).toBe('hoy a las 23:00');
    expect(cuandoTermina('2026-10-27T16:00:00Z', AHORA)).toBe('mañana a las 10:00');
    expect(cuandoTermina(null, AHORA)).toBeNull();
  });

  it('recortar no deja palabras a la mitad', () => {
    expect(recortar('Hidrolavadora eléctrica portátil', 20)).toBe('Hidrolavadora…');
    expect(recortar('corto', 20)).toBe('corto');
  });

  it('ideaVideo cierra con el número del perfil', () => {
    expect(ideaVideo(producto(), 4)).toContain('el número 4');
  });

  it('repartirEnHorarios no inventa horarios de más', () => {
    expect(repartirEnHorarios([producto()])).toHaveLength(1);
    expect(repartirEnHorarios(Array(9).fill(producto()))).toHaveLength(HORARIOS_SUGERIDOS.length);
  });
});
