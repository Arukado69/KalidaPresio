/**
 * Tests de la decisión que dispara la alarma del scraper.
 *
 * Aquí lo que se protege es el equilibrio entre dos formas de fallar:
 *   · alarmar de más → ruido → la alarma se ignora → se pierden 43 días
 *   · alarmar de menos → silencio → se pierden 43 días igual
 *
 * Por eso los casos de abajo fijan sobre todo las FRONTERAS: qué se considera
 * un hipo tolerable y qué una avería que hay que gritar.
 */
import { describe, it, expect } from 'vitest';
import { evaluarFeed } from './verificarFrescura.js';

const AHORA = Date.parse('2026-08-20T18:00:00.000Z');
const sobre = (horas, n = 41) => ({
  generadoEl: new Date(AHORA - horas * 3_600_000).toISOString(),
  total: n,
  items: Array.from({ length: n }, (_, i) => ({ id: `MLM${i}` })),
});

describe('evaluarFeed — cuándo suena la alarma', () => {
  it('un feed reciente está sano', () => {
    const r = evaluarFeed(sobre(3), 12, AHORA);
    expect(r.sano).toBe(true);
    expect(r.items).toBe(41);
  });

  it('justo en el umbral todavía NO alarma', () => {
    expect(evaluarFeed(sobre(12), 12, AHORA).sano).toBe(true);
  });

  it('pasado el umbral, alarma', () => {
    const r = evaluarFeed(sobre(12.5), 12, AHORA);
    expect(r.sano).toBe(false);
    expect(r.motivo).toContain('12.5 h');
  });

  it('los 43 días reales del incidente disparan la alarma sin ambigüedad', () => {
    const r = evaluarFeed(sobre(24 * 43), 12, AHORA);
    expect(r.sano).toBe(false);
    expect(r.edadHoras).toBeGreaterThan(1000);
  });
});

describe('evaluarFeed — «no lo sé» no puede pasar por «está bien»', () => {
  it('el formato antiguo (array sin sello) se trata como averiado', () => {
    // Es la trampa que permitió el incidente: sin fecha no hay forma de saber
    // si el feed es de hoy o de hace dos meses, así que no se le da el pase.
    const r = evaluarFeed([{ id: 'MLM1' }], 12, AHORA);
    expect(r.sano).toBe(false);
    expect(r.motivo).toContain('sello de fecha');
    expect(r.items).toBe(1);
  });

  it('un sello que no es fecha tampoco cuela', () => {
    const r = evaluarFeed({ generadoEl: 'ayer por la tarde', items: [{ id: 'x' }] }, 12, AHORA);
    expect(r.sano).toBe(false);
    expect(r.motivo).toContain('no es una fecha válida');
  });

  it('un feed vacío o ilegible alarma', () => {
    for (const malo of [null, undefined, {}, { items: [] }, [], 'no es json']) {
      expect(evaluarFeed(malo, 12, AHORA).sano).toBe(false);
    }
  });
});

describe('evaluarFeed — el motivo sirve para diagnosticar, no solo para fallar', () => {
  it('dice la edad y el umbral cuando falla', () => {
    const m = evaluarFeed(sobre(30), 12, AHORA).motivo;
    expect(m).toContain('30.0 h');
    expect(m).toContain('máximo 12 h');
  });

  it('dice desde cuándo cuando está sano', () => {
    expect(evaluarFeed(sobre(2), 12, AHORA).motivo).toContain('2 horas');
  });

  it('un reloj adelantado no rompe la evaluación', () => {
    const futuro = { generadoEl: new Date(AHORA + 3_600_000).toISOString(), items: [{ id: 'x' }] };
    expect(evaluarFeed(futuro, 12, AHORA).sano).toBe(true);
  });
});
