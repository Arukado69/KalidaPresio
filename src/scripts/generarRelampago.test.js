/**
 * Test de la fuente, no del comportamiento: generarRelampago.js hace
 * `readFileSync`/`writeFileSync` en el nivel superior del módulo (corre al
 * importarlo), así que no se puede `import`-ear en un test sin mutar
 * public/data/relampago.json de verdad. En vez de eso, se lee su código como
 * texto y se comprueba que sigue enganchado a la fuente única de verdad.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * Antes de este fix, `esDescuentoFalso` comparaba `v.nivel === 'descuento-falso'`
 * a mano. Si ese literal reaparece, un cambio futuro en NIVEL_DESCUENTO_FALSO
 * (src/utils/historico.js) dejaría el carrusel más visible del sitio
 * promocionando exactamente el descuento que el propio sitio acusa de falso —
 * la contradicción que el docblock de este archivo describe como "la más
 * visible posible". Este test no prueba el VALOR de la constante (eso lo hace
 * historico.test.js); prueba que la fuente sigue importándola.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./generarRelampago.js', import.meta.url), 'utf-8');

describe('generarRelampago.js usa la fuente única del nivel de descuento falso', () => {
  it('importa NIVEL_DESCUENTO_FALSO desde utils/historico.js', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bNIVEL_DESCUENTO_FALSO\b[^}]*\}\s*from\s*['"]\.\.\/utils\/historico\.js['"]/);
  });

  it('compara contra la constante importada, no contra el literal a mano', () => {
    expect(src).toMatch(/===\s*NIVEL_DESCUENTO_FALSO\b/);
    // Si volviera a aparecer `=== 'descuento-falso'` literal, es la señal
    // exacta de que alguien deshizo el fix sin darse cuenta.
    expect(src).not.toMatch(/===\s*['"]descuento-falso['"]/);
  });
});
