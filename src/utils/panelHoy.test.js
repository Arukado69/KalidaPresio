/**
 * Test de la fuente, no del comportamiento: src/pages/panel/hoy.astro es un
 * componente Astro (frontmatter + HTML), no se puede `import`-ear en Vitest
 * sin el compilador de Astro. En vez de eso, se lee su código como texto y se
 * comprueba que el corte «no publicar hoy» sigue enganchado a la fuente única
 * de verdad.
 *
 * OJO de ubicación: este archivo vive en src/utils y NO en src/pages/panel,
 * a propósito. Astro trata cualquier .js dentro de src/pages como una ruta
 * (endpoint) del sitio — un archivo de test puesto ahí se compila como página
 * real y rompe `astro build` (se comprobó: generaba /panel/hoy.test y tronaba
 * con ENOENT en el prerender). Vitest encuentra este test igual, sin más
 * configuración: su patrón por defecto ya cubre cualquier archivo de test del
 * proyecto, sea cual sea su carpeta.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * Antes de este fix, `publicables`/`noPublicar` comparaban
 * `i.nivel !== 'alto' && i.nivel !== 'descuento-falso'` a mano. Si ese literal
 * reaparece, un cambio futuro en NIVELES_NO_DISTRIBUIBLES (./historico.js)
 * dejaría el panel de reparto manual mostrando como "lista para publicar" una
 * oferta con un descuento que el propio sitio ya demostró falso.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../pages/panel/hoy.astro', import.meta.url), 'utf-8');

describe('panel/hoy.astro usa la fuente única de niveles no distribuibles', () => {
  it('importa NIVELES_NO_DISTRIBUIBLES desde utils/historico.js', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bNIVELES_NO_DISTRIBUIBLES\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/utils\/historico\.js['"]/);
  });

  it('usa la constante importada para separar publicables de no-publicables', () => {
    expect(src).toMatch(/NIVELES_NO_DISTRIBUIBLES\.includes\(/);
    // Si volviera a aparecer `!== 'alto' && ... !== 'descuento-falso'` a mano,
    // es la señal exacta de que alguien deshizo el fix sin darse cuenta.
    expect(src).not.toMatch(/!==\s*['"]descuento-falso['"]/);
  });
});
