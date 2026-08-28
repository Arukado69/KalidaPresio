/**
 * Tests del registro de canales.
 *
 * Lo que se protege aquí es que `<canal><seccion>` se pueda volver a partir sin
 * ambigüedad. Si un código de canal fuera prefijo de una sección real, la
 * sección se leería cortada y el panel de ML mostraría etiquetas que no
 * corresponden a nada — el mismo tipo de mentira silenciosa que ya costó dos
 * meses de precios viejos en la portada.
 */
import { describe, it, expect } from 'vitest';
import {
  CANALES,
  CODIGOS_CANAL,
  CANAL_POR_DEFECTO,
  esCanal,
  normalizarCanal,
  partirCampana,
  componerCampana,
} from './canales.js';
import { aLinkAfiliado } from './afiliado.js';
import { seccionDesdeHref, canalDesdeHref } from './analitica.js';

/** Todas las secciones que el sitio pasa hoy a aLinkAfiliado. */
const SECCIONES_EN_USO = [
  'elegidos', 'hero', 'bento', 'relampago', 'imbatibles', 'showpiece',
  'whatsapp', 'sugerencia404', 'menos500', 'gangas', 'curados',
];

const CATALOGO = 'https://www.mercadolibre.com.mx/bocina-portatil-aiwa/p/MLM19045710';

describe('el registro', () => {
  it('usa códigos de exactamente dos letras minúsculas', () => {
    for (const c of CODIGOS_CANAL) expect(c).toMatch(/^[a-z]{2}$/);
  });

  it('incluye el sitio como canal por defecto', () => {
    expect(esCanal(CANAL_POR_DEFECTO)).toBe(true);
    expect(CANALES[CANAL_POR_DEFECTO]).toBeTruthy();
  });

  it('NINGÚN código es prefijo de una sección en uso', () => {
    // Este es EL invariante del módulo. Si se cae, hay que renombrar el código
    // nuevo (o la sección), no "arreglar" el parser.
    for (const seccion of SECCIONES_EN_USO) {
      expect(esCanal(seccion.slice(0, 2))).toBe(false);
    }
  });
});

describe('normalizarCanal', () => {
  it('acepta los códigos conocidos, sin importar mayúsculas ni espacios', () => {
    expect(normalizarCanal('tg')).toBe('tg');
    expect(normalizarCanal(' TG ')).toBe('tg');
  });

  it('degrada al sitio cualquier basura, en vez de lanzar', () => {
    // Un enlace que cobra no se rompe por una etiqueta mal escrita.
    for (const malo of [null, undefined, '', 'zz', 42, {}, 'telegram']) {
      expect(normalizarCanal(malo)).toBe(CANAL_POR_DEFECTO);
    }
  });
});

describe('componerCampana', () => {
  it('sin sección ni canal no etiqueta nada (matt_word intacto)', () => {
    expect(componerCampana()).toBe('');
    expect(componerCampana('')).toBe('');
  });

  it('antepone el canal a la sección', () => {
    expect(componerCampana('relampago', 'tg')).toBe('tgrelampago');
    expect(componerCampana('relampago')).toBe('wbrelampago');
  });

  it('etiqueta el canal aunque no haya sección', () => {
    expect(componerCampana(undefined, 'wa')).toBe('wa');
  });

  it('sanea la sección a alfanuméricos: el sufijo nunca puede llevar «_»', () => {
    // De esto depende que partir por el último guion bajo sea correcto.
    expect(componerCampana('menos-500_hoy', 'tg')).toBe('tgmenos500hoy');
  });
});

describe('partirCampana', () => {
  it('separa canal y sección', () => {
    expect(partirCampana('tgrelampago')).toEqual({ canal: 'tg', seccion: 'relampago' });
  });

  it('lee un sufijo sin canal como sección del sitio (enlaces anteriores)', () => {
    // Los enlaces ya compartidos siguen leyéndose bien.
    expect(partirCampana('relampago')).toEqual({ canal: 'wb', seccion: 'relampago' });
  });

  it('un canal solo, sin sección', () => {
    expect(partirCampana('wa')).toEqual({ canal: 'wa', seccion: null });
  });

  it('no truena con entradas inservibles', () => {
    expect(partirCampana('')).toEqual({ canal: 'wb', seccion: null });
    expect(partirCampana(null)).toEqual({ canal: 'wb', seccion: null });
  });
});

describe('ida y vuelta — lo que genera el sitio es lo que lee la analítica', () => {
  it('recupera canal y sección de cualquier combinación', () => {
    for (const canal of CODIGOS_CANAL) {
      for (const seccion of SECCIONES_EN_USO) {
        const href = aLinkAfiliado(CATALOGO, seccion, canal);
        expect(canalDesdeHref(href)).toBe(canal);
        expect(seccionDesdeHref(href)).toBe(seccion);
      }
    }
  });
});
