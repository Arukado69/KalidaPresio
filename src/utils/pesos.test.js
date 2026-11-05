/**
 * Tests del formato de precios. Lo que se protege: que el sitio NUNCA
 * redondee un precio hacia arriba ($99.59 salía como «$100»).
 */
import { describe, it, expect } from 'vitest';
import { pesos } from './pesos.js';

describe('pesos', () => {
  it('con centavos los muestra, sin redondear', () => {
    expect(pesos(99.59)).toBe('$99.59');
    expect(pesos(1299.5)).toBe('$1,299.50');
  });

  it('sin centavos, como los escribe Mercado Libre', () => {
    expect(pesos(1299)).toBe('$1,299');
    expect(pesos('869')).toBe('$869');
  });

  it('lo ilegible es $0, no NaN', () => {
    expect(pesos(null)).toBe('$0');
    expect(pesos('abc')).toBe('$0');
  });
});
