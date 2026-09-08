/**
 * n8n/telegram-tecnologia.json NO puede importar src/utils/historico.js: es
 * un flujo de otro sistema, guardado como JSON con JavaScript metido dentro
 * de un string (`jsCode`). No hay `import` posible ahí — y por eso repite el
 * literal 'alto' / 'descuento-falso' a mano en vez de referenciar la fuente
 * única de verdad que el resto del repo ya usa.
 *
 * ── POR QUÉ ESTE TEST ES EL ÚNICO QUE PROTEGE ESTO ─────────────────────────
 * Esta es precisamente la brecha que dejó pasar el hallazgo crítico de la
 * revisión final: el filtro de este workflow excluía 'alto' pero no
 * 'descuento-falso', y ese canal corre solo cada 3 horas — sin nadie mirando —
 * así que habría publicado en automático justo el descuento que el sitio
 * acusa de mentira. `historico.test.js` prueba la función pura, pero nunca
 * mira este archivo; nada más en el repo lo hace tampoco. Si en el futuro
 * NIVELES_NO_DISTRIBUIBLES gana un nivel nuevo, o el nombre de uno de los
 * existentes cambia, ESTE test es el único que se entera de que el filtro de
 * n8n se quedó atrás — porque es el único que compara el JSON contra la
 * fuente real en vez de contra otro literal copiado.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { NIVELES_NO_DISTRIBUIBLES } from '../src/utils/historico.js';

const RUTA = new URL('./telegram-tecnologia.json', import.meta.url);

function leerJsCode() {
  const workflow = JSON.parse(readFileSync(RUTA, 'utf-8'));
  const nodo = workflow.nodes.find((n) => n.id === 'kp-elegir');
  return nodo.parameters.jsCode;
}

describe('n8n/telegram-tecnologia.json — el filtro que corre sin nadie mirando', () => {
  it('el archivo sigue siendo JSON válido', () => {
    expect(() => JSON.parse(readFileSync(RUTA, 'utf-8'))).not.toThrow();
  });

  it('el jsCode de "Elegir que publicar" excluye TODOS los niveles no distribuibles', () => {
    const jsCode = leerJsCode();
    for (const nivel of NIVELES_NO_DISTRIBUIBLES) {
      // Se busca el literal entre comillas simples, tal como lo escribe el
      // propio código del nodo (`o.historico.nivel !== 'alto'`, etc.). Si un
      // nivel del conjunto ya no aparece aquí, el filtro dejó de cubrirlo.
      expect(jsCode, `el filtro de n8n no menciona el nivel '${nivel}'`).toContain(`'${nivel}'`);
    }
  });

  it('el filtro sigue negando explícitamente cada nivel (no solo mencionándolo de paso)', () => {
    // Cinturón y tirantes: no basta con que el string aparezca en algún
    // comentario — tiene que estar en una comparación `!==` dentro del
    // `.filter(...)` que decide qué se publica.
    const jsCode = leerJsCode();
    const filtro = jsCode.slice(jsCode.indexOf('const candidatos'), jsCode.indexOf('function armar'));
    for (const nivel of NIVELES_NO_DISTRIBUIBLES) {
      expect(filtro, `el .filter() de n8n no niega el nivel '${nivel}'`).toMatch(
        new RegExp(`historico\\.nivel\\s*!==\\s*'${nivel}'`),
      );
    }
  });
});
