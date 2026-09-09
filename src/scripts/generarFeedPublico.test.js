/**
 * Test de la fuente, no del comportamiento: generarFeedPublico.js hace
 * `readFileSync`/`writeFileSync` en el nivel superior del módulo (corre al
 * importarlo), así que no se puede `import`-ear en un test sin mutar
 * public/data/feed.json de verdad. En vez de eso, se lee su código como texto
 * y se comprueba que sigue enganchado a la fuente única de verdad.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * Antes de este fix, este archivo repetía `new Set(['alto', 'descuento-falso'])`
 * a mano. Si alguien vuelve a hacerlo — por ejemplo "arreglando" algo rápido y
 * sin acordarse de que la constante existe — un cambio futuro en
 * NIVELES_NO_DISTRIBUIBLES (src/utils/historico.js) dejaría este archivo
 * comparando contra un literal muerto, y el feed volvería a marcar como
 * "publicable" algo que no debería. Este test no prueba el VALOR de la
 * constante (eso lo hace historico.test.js); prueba que la fuente sigue
 * importándola en vez de haber vuelto a copiar el string.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./generarFeedPublico.js', import.meta.url), 'utf-8');

describe('generarFeedPublico.js usa la fuente única de niveles no distribuibles', () => {
  it('importa NIVELES_NO_DISTRIBUIBLES desde utils/historico.js', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bNIVELES_NO_DISTRIBUIBLES\b[^}]*\}\s*from\s*['"]\.\.\/utils\/historico\.js['"]/);
  });

  it('usa la constante importada para decidir qué es publicable, no un Set escrito a mano', () => {
    expect(src).toMatch(/NIVELES_NO_DISTRIBUIBLES\.includes\(/);
    // Si volviera a aparecer un `new Set(['alto', 'descuento-falso'])` literal,
    // es la señal exacta de que alguien deshizo el fix sin darse cuenta.
    expect(src).not.toMatch(/new Set\(\[\s*['"]alto['"]/);
  });
});
