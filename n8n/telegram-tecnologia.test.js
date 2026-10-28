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

/**
 * Ejecuta el jsCode del nodo con dobles de las funciones de n8n. Así se prueba
 * lo que de verdad corre en tu servidor, no una copia.
 */
function ejecutar(feed, config = {}) {
  const CONFIG = { canal_codigo: 'tg', categoria: '', score_minimo: 0, max_por_corrida: 3, ...config };
  const estado = {};
  const fn = new Function('$', '$input', '$getWorkflowStaticData', leerJsCode());
  const salida = fn(
    () => ({ first: () => ({ json: CONFIG }) }),
    { first: () => ({ json: feed }) },
    () => estado,
  );
  return { salida: salida.map((s) => s.json), estado };
}

const item = (extra = {}) => ({
  id: 'MLM53177027', titulo: 'Hidrolavadora', categoria: 'Hogar',
  precio_actual: 869, precio_previo: 2299, descuento: 62, score: 90, rating: 4.8, vendidos: 250000,
  imagen: 'https://http2.mlstatic.com/x.webp', relampago: false, termina: null, caduca: null,
  revisado: '2026-10-26T15:00:00.000Z', enlace: 'https://meli.la/General', enlaces: {},
  historico: { nivel: 'sin-datos', texto: null }, ...extra,
});

describe('n8n — lo que publica', () => {
  it('publica el link OFICIAL tal cual, prefiriendo el de la etiqueta de Telegram', () => {
    const { salida } = ejecutar({ esquema: 2, sitio: 'https://kp.mx', items: [
      item(),
      item({ id: 'B', enlaces: { tg: 'https://meli.la/SoloTelegram' } }),
    ] });
    expect(salida).toHaveLength(2);
    expect(salida[0].mensaje).toContain('https://meli.la/General');
    expect(salida[1].mensaje).toContain('https://meli.la/SoloTelegram');
    expect(salida[0].mensaje).not.toContain('matt_');
    expect(salida[0].mensaje.toLowerCase()).toContain('afiliado');
  });

  it('NO publica un link que no sea oficial, aunque llegue en el feed', () => {
    const { salida } = ejecutar({ esquema: 2, sitio: 'https://kp.mx', items: [
      item({ enlace: 'https://www.mercadolibre.com.mx/x/p/MLM1?matt_tool=1&matt_word=2' }),
    ] });
    expect(salida).toHaveLength(0);
  });

  it('se niega a correr con un esquema que no conoce', () => {
    expect(() => ejecutar({ esquema: 1, items: [] })).toThrow(/Esquema/);
  });

  it('no repite lo ya publicado (salvo que actualices el precio)', () => {
    const feed = { esquema: 2, sitio: 'https://kp.mx', items: [item()] };
    const CONFIG = { canal_codigo: 'tg', categoria: '', score_minimo: 0, max_por_corrida: 3 };
    const estado = {};
    const fn = new Function('$', '$input', '$getWorkflowStaticData', leerJsCode());
    const correr = (f) => fn(() => ({ first: () => ({ json: CONFIG }) }), { first: () => ({ json: f }) }, () => estado);
    expect(correr(feed)).toHaveLength(1);
    expect(correr(feed)).toHaveLength(0);
    expect(correr({ ...feed, items: [item({ revisado: '2026-10-27T15:00:00.000Z' })] })).toHaveLength(1);
  });
});

