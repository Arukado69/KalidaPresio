/**
 * Tests de la publicación desde el panel.
 *
 * Lo que se protege: que el panel nunca pise un cambio hecho por otro lado
 * sin preguntar, que un token rechazado se distinga de una caída de red (uno
 * se arregla pegando otro token, la otra reintentando), y que los acentos y
 * los emoji de los títulos lleguen intactos a GitHub.
 */
import { describe, it, expect } from 'vitest';
import {
  aBase64,
  deBase64,
  mismaVitrina,
  repoDesdeUrlEditor,
  publicarVitrina,
  RUTA_VITRINA,
} from './publicarGithub.js';

const vitrina = (...titulos) => ({ _ayuda: ['…'], productos: titulos.map((titulo) => ({ link: 'https://meli.la/1AbCdE', titulo })) });
const texto = (v) => JSON.stringify(v, null, 2) + '\n';

/** Un GitHub de mentira: guarda lo que hay y anota cada llamada. */
function githubFalso({ contenido, sha = 'sha-1', estadoLeer = 200, estadoEscribir = 200, lanzar = false } = {}) {
  const llamadas = [];
  const fetch = async (url, opciones = {}) => {
    llamadas.push({ url, ...opciones, cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
    if (lanzar) throw new Error('sin red');
    const escribir = opciones.method === 'PUT';
    const status = escribir ? estadoEscribir : estadoLeer;
    const json = escribir
      ? { content: { sha: 'sha-2' }, commit: { html_url: 'https://github.com/x/commit/2' } }
      : { sha, content: aBase64(contenido).replace(/(.{60})/g, '$1\n') };
    return { status, ok: status >= 200 && status < 300, json: async () => json };
  };
  return { fetch, llamadas };
}

describe('base64 con acentos y emoji', () => {
  it('ida y vuelta sin perder nada', () => {
    const t = 'Bocina «Aiwa» — envío gratis ⚡ 100 % ñandú 😊';
    expect(deBase64(aBase64(t))).toBe(t);
  });

  it('aguanta archivos grandes (no revienta la pila)', () => {
    const grande = 'é'.repeat(200_000);
    expect(deBase64(aBase64(grande))).toBe(grande);
  });
});

describe('mismaVitrina — los productos, no el formato', () => {
  it('distinta sangría o distinto _ayuda es la misma vitrina', () => {
    const a = vitrina('Uno', 'Dos');
    expect(mismaVitrina(JSON.stringify(a), { ...a, _ayuda: ['otra'] })).toBe(true);
  });

  it('un producto distinto ya no es la misma', () => {
    expect(mismaVitrina(vitrina('Uno'), vitrina('Uno', 'Dos'))).toBe(false);
  });

  it('un texto que no es JSON nunca es «la misma»', () => {
    expect(mismaVitrina('{roto', vitrina('Uno'))).toBe(false);
  });
});

describe('repoDesdeUrlEditor', () => {
  it('saca el repositorio y la rama de la URL del editor', () => {
    expect(repoDesdeUrlEditor('https://github.com/otra/cosa/edit/produccion/src/data/vitrina.json'))
      .toEqual({ repo: 'otra/cosa', rama: 'produccion' });
  });

  it('sin URL válida, el repositorio de siempre', () => {
    expect(repoDesdeUrlEditor(null)).toEqual({ repo: 'Arukado69/KalidaPresio', rama: 'main' });
  });
});

describe('publicarVitrina', () => {
  const base = vitrina('Uno');
  const nueva = texto(vitrina('Uno', 'Dos'));

  it('lee, comprueba y escribe con el sha leído, en la rama y el archivo correctos', async () => {
    const gh = githubFalso({ contenido: texto(base) });
    const r = await publicarVitrina({ token: ' t0k3n ', contenido: nueva, base, fetch: gh.fetch, mensaje: 'vitrina: 2 productos' });
    expect(r).toEqual({ ok: true, sha: 'sha-2', url: 'https://github.com/x/commit/2' });
    const [leer, escribir] = gh.llamadas;
    expect(leer.url).toBe(`https://api.github.com/repos/Arukado69/KalidaPresio/contents/${RUTA_VITRINA}?ref=main`);
    expect(leer.headers.Authorization).toBe('Bearer t0k3n');
    expect(escribir.method).toBe('PUT');
    expect(escribir.cuerpo).toMatchObject({ sha: 'sha-1', branch: 'main', message: 'vitrina: 2 productos' });
    expect(deBase64(escribir.cuerpo.content)).toBe(nueva);
  });

  it('NO pisa un cambio hecho por otro lado: devuelve conflicto y no escribe', async () => {
    const gh = githubFalso({ contenido: texto(vitrina('Uno', 'Editado en GitHub')) });
    const r = await publicarVitrina({ token: 't', contenido: nueva, base, fetch: gh.fetch });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('conflicto');
    expect(r.remoto).toContain('Editado en GitHub');
    expect(gh.llamadas.some((l) => l.method === 'PUT')).toBe(false);
  });

  it('con forzar sí escribe, porque la persona lo confirmó', async () => {
    const gh = githubFalso({ contenido: texto(vitrina('Otra')) });
    expect((await publicarVitrina({ token: 't', contenido: nueva, base, forzar: true, fetch: gh.fetch })).ok).toBe(true);
  });

  it('si ya está igual en GitHub, no crea un commit vacío', async () => {
    const gh = githubFalso({ contenido: nueva });
    expect(await publicarVitrina({ token: 't', contenido: nueva, base, fetch: gh.fetch })).toEqual({ ok: true, sinCambios: true, sha: 'sha-1' });
    expect(gh.llamadas).toHaveLength(1);
  });

  it('el 409 de GitHub (cambió entre leer y escribir) es un conflicto', async () => {
    const gh = githubFalso({ contenido: texto(base), estadoEscribir: 409 });
    expect((await publicarVitrina({ token: 't', contenido: nueva, base, fetch: gh.fetch })).motivo).toBe('conflicto');
  });

  it('un token rechazado se distingue de una caída de red', async () => {
    for (const estadoLeer of [401, 403, 404]) {
      const gh = githubFalso({ contenido: texto(base), estadoLeer });
      expect((await publicarVitrina({ token: 't', contenido: nueva, base, fetch: gh.fetch })).motivo).toBe('token');
    }
    const sinPermiso = githubFalso({ contenido: texto(base), estadoEscribir: 403 });
    expect((await publicarVitrina({ token: 't', contenido: nueva, base, fetch: sinPermiso.fetch })).motivo).toBe('token');
    const caido = githubFalso({ contenido: texto(base), lanzar: true });
    expect((await publicarVitrina({ token: 't', contenido: nueva, base, fetch: caido.fetch })).motivo).toBe('red');
    const roto = githubFalso({ contenido: texto(base), estadoLeer: 500 });
    expect((await publicarVitrina({ token: 't', contenido: nueva, base, fetch: roto.fetch })).motivo).toBe('github');
  });

  it('sin token ni siquiera llama a GitHub', async () => {
    const gh = githubFalso({ contenido: texto(base) });
    expect((await publicarVitrina({ token: '', contenido: nueva, base, fetch: gh.fetch })).motivo).toBe('token');
    expect(gh.llamadas).toHaveLength(0);
  });
});
