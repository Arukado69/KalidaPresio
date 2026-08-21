/**
 * Tests del sello de frescura.
 *
 * La regla que se protege aquí es que el sitio NUNCA presuma una frescura que
 * no tiene. El pie mostraba `new Date()` —la fecha del build— como si fuera la
 * de los datos, así que cualquier despliegue de código rejuvenecía unos precios
 * que llevaban semanas parados. Estos tests fijan el comportamiento honesto.
 */
import { describe, it, expect } from 'vitest';
import { describirFrescura, fraseFrescura, HORAS_FRESCO, HORAS_RECIENTE } from './frescura.js';

// Instante fijo de referencia: los tests no dependen del reloj de quien los corra.
const AHORA = Date.parse('2026-08-20T18:00:00.000Z');
const haceHoras = (h) => new Date(AHORA - h * 3_600_000).toISOString();
const haceMin = (m) => new Date(AHORA - m * 60_000).toISOString();

describe('describirFrescura — niveles', () => {
  it('marca fresco lo de menos de 6 h', () => {
    expect(describirFrescura(haceHoras(0.5), AHORA).nivel).toBe('fresco');
    expect(describirFrescura(haceHoras(HORAS_FRESCO - 0.1), AHORA).nivel).toBe('fresco');
  });

  it('marca reciente entre 6 y 24 h', () => {
    expect(describirFrescura(haceHoras(HORAS_FRESCO), AHORA).nivel).toBe('reciente');
    expect(describirFrescura(haceHoras(HORAS_RECIENTE - 0.1), AHORA).nivel).toBe('reciente');
  });

  it('marca viejo a partir de 24 h', () => {
    expect(describirFrescura(haceHoras(HORAS_RECIENTE), AHORA).nivel).toBe('viejo');
    expect(describirFrescura(haceHoras(24 * 43), AHORA).nivel).toBe('viejo');
  });

  it('admite que no sabe en vez de inventarse una fecha', () => {
    for (const malo of [null, undefined, '', 'no-es-una-fecha', 42, {}]) {
      const f = describirFrescura(malo, AHORA);
      expect(f.nivel).toBe('desconocido');
      expect(f.iso).toBeNull();
      expect(f.horas).toBeNull();
    }
  });
});

describe('describirFrescura — texto', () => {
  it('usa la escala que corresponde', () => {
    expect(describirFrescura(haceMin(0.2), AHORA).texto).toBe('hace un momento');
    expect(describirFrescura(haceMin(1), AHORA).texto).toBe('hace 1 minuto');
    expect(describirFrescura(haceMin(45), AHORA).texto).toBe('hace 45 minutos');
    expect(describirFrescura(haceHoras(1), AHORA).texto).toBe('hace 1 hora');
    expect(describirFrescura(haceHoras(9), AHORA).texto).toBe('hace 9 horas');
    expect(describirFrescura(haceHoras(24), AHORA).texto).toBe('hace 1 día');
    expect(describirFrescura(haceHoras(24 * 3), AHORA).texto).toBe('hace 3 días');
  });

  it('NO recorta las antigüedades grandes: cuando el número asusta hay que verlo', () => {
    // El feed real llevaba 43 días parado. «hace más de una semana» lo tapaba.
    expect(describirFrescura(haceHoras(24 * 43), AHORA).texto).toBe('hace 43 días');
  });

  it('no produce negativos si el reloj va adelantado', () => {
    const futuro = new Date(AHORA + 3_600_000).toISOString();
    expect(describirFrescura(futuro, AHORA).texto).toBe('hace un momento');
  });

  it('conserva la marca absoluta para el title y para quien no tenga JS', () => {
    const f = describirFrescura(haceHoras(2), AHORA);
    expect(f.absoluto).toBeTruthy();
    expect(f.iso).toBe(new Date(AHORA - 2 * 3_600_000).toISOString());
  });
});

describe('fraseFrescura', () => {
  it('avisa cuando el dato es viejo, en vez de disimularlo', () => {
    const f = describirFrescura(haceHoras(24 * 43), AHORA);
    expect(fraseFrescura(f)).toContain('hace 43 días');
    expect(fraseFrescura(f)).toContain('pueden haber cambiado');
  });

  it('con dato fresco no mete miedo de más', () => {
    const f = describirFrescura(haceHoras(2), AHORA);
    expect(fraseFrescura(f)).toBe('Precios detectados hace 2 horas');
    expect(fraseFrescura(f)).not.toContain('pueden haber cambiado');
  });

  it('sin fecha lo dice y remite a verificar', () => {
    const f = describirFrescura(null, AHORA);
    expect(fraseFrescura(f)).toContain('sin fecha');
    expect(fraseFrescura(f)).toContain('Mercado Libre');
  });
});
