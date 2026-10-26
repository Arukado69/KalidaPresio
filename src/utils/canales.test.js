/**
 * Tests del registro de canales.
 *
 * Los códigos son las claves de `enlaces` en la vitrina y de las plantillas del
 * panel de publicación. Lo que se protege: que sean estables, cortos y que una
 * etiqueta mal escrita nunca rompa nada.
 */
import { describe, it, expect } from 'vitest';
import {
  CANALES,
  CODIGOS_CANAL,
  CANAL_POR_DEFECTO,
  esCanal,
  normalizarCanal,
  nombreCanal,
} from './canales.js';

describe('el registro', () => {
  it('usa códigos de exactamente dos letras minúsculas', () => {
    for (const c of CODIGOS_CANAL) expect(c).toMatch(/^[a-z]{2}$/);
  });

  it('incluye el sitio como canal por defecto', () => {
    expect(esCanal(CANAL_POR_DEFECTO)).toBe(true);
    expect(CANALES[CANAL_POR_DEFECTO]).toBeTruthy();
  });

  it('cubre las redes donde se publica', () => {
    for (const c of ['wa', 'tg', 'fb', 'ig', 'tt']) expect(esCanal(c)).toBe(true);
  });
});

describe('normalizarCanal', () => {
  it('acepta los códigos conocidos, sin importar mayúsculas ni espacios', () => {
    expect(normalizarCanal('tg')).toBe('tg');
    expect(normalizarCanal(' TG ')).toBe('tg');
  });

  it('degrada al sitio cualquier basura, en vez de lanzar', () => {
    for (const malo of [null, undefined, '', 'zz', 42, {}, 'telegram']) {
      expect(normalizarCanal(malo)).toBe(CANAL_POR_DEFECTO);
    }
  });
});

describe('nombreCanal', () => {
  it('da el nombre legible, o «Desconocido»', () => {
    expect(nombreCanal('wa')).toBe('WhatsApp');
    expect(nombreCanal('zz')).toBe('Desconocido');
  });
});
