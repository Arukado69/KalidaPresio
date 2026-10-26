/**
 * Tests del marcador del navegador.
 *
 * El marcador se arma a partir de su propio código fuente. Lo que se protege:
 * que el enlace resultante sea JavaScript válido y autocontenido (un marcador
 * roto no avisa: simplemente no hace nada al tocarlo), y que la página que lo
 * recibe no truene con lo que llegue en la URL.
 */
import { describe, it, expect } from 'vitest';
import { enlaceMarcador, leerEnvioMarcador, marcador } from './marcador.js';

describe('enlaceMarcador', () => {
  const enlace = enlaceMarcador('https://kp.mx/');
  const fuente = decodeURIComponent(enlace.replace(/^javascript:/, ''));

  it('es un enlace javascript: con código que compila', () => {
    expect(enlace.startsWith('javascript:')).toBe(true);
    expect(() => new Function(fuente)).not.toThrow();
  });

  it('lleva el sitio (sin barra final) y no deja el marcador de posición', () => {
    expect(fuente).toContain("'https://kp.mx'");
    expect(fuente).not.toContain('__SITIO__');
  });

  it('no depende de nada de fuera de la función (corre en la página de ML)', () => {
    // Si alguien usa un import o una variable del módulo, el marcador se rompe
    // en la página del producto. La función tiene que ser autosuficiente.
    expect(marcador.toString()).not.toMatch(/\bimport\b|\bexport\b|require\(/);
  });

  it('el enlace no lleva caracteres crudos que rompan la barra de marcadores', () => {
    expect(enlace.slice('javascript:'.length)).not.toMatch(/[\s"'<>]/);
  });
});

describe('leerEnvioMarcador', () => {
  it('lee lo que manda el marcador', () => {
    const d = { titulo: 'Bocina & más', precio: 849, link: 'https://meli.la/1AbCdE' };
    expect(leerEnvioMarcador(`#nuevo=${encodeURIComponent(JSON.stringify(d))}`)).toEqual(d);
  });

  it('ignora lo que no viene del marcador, sin tronar', () => {
    for (const malo of ['', '#otra-cosa', '#nuevo=%E0%A4%A', '#nuevo=no-es-json', '#nuevo=%5B1%2C2%5D', null, undefined]) {
      expect(leerEnvioMarcador(malo)).toBeNull();
    }
  });
});
