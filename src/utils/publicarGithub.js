/**
 * publicarGithub — Sube vitrina.json a GitHub desde /panel/agregar.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * Agregar un producto costaba nueve pasos y los últimos cuatro eran los peores:
 * copiar el JSON entero, abrir GitHub, seleccionar todo, pegar y hacer commit.
 * En el celular eso es casi imposible, y la vitrina se quedó vacía. Con esto
 * el panel hace el commit él solo con la API de contenidos de GitHub: el
 * historial sigue en git y el deploy de siempre se dispara igual.
 *
 * ── EL TOKEN ───────────────────────────────────────────────────────────────
 * Un token «fine-grained» que TÚ creas, limitado a este repositorio y al
 * permiso Contents. Vive solo en el navegador donde lo pegaste: el sitio no
 * lo ve ni lo guarda en ningún lado. Sin permiso de Workflows no puede tocar
 * .github/, y el panel solo escribe src/data/vitrina.json.
 *
 * ── NO PISAR UN CAMBIO AJENO ───────────────────────────────────────────────
 * Antes de escribir se lee lo que hay en GitHub. Si no coincide con la base
 * del panel (lo último que publicó o con lo que se construyó la página),
 * alguien lo cambió por otro lado: se devuelve `conflicto` y el panel
 * pregunta. Además se manda el `sha` leído, así que si cambia entre la
 * lectura y la escritura GitHub responde 409 en vez de pisarlo.
 *
 * `fetch` se inyecta para poder probarlo sin red.
 */

export const REPO_POR_DEFECTO = 'Arukado69/KalidaPresio';
export const RAMA_POR_DEFECTO = 'main';
export const RUTA_VITRINA = 'src/data/vitrina.json';

/** Texto UTF-8 → base64 (la API de contenidos solo habla base64). */
export function aBase64(texto) {
  const bytes = new TextEncoder().encode(String(texto));
  let binario = '';
  // Por bloques: String.fromCharCode(...bytes) revienta la pila con un archivo grande.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

/** base64 (con los saltos de línea que manda GitHub) → texto UTF-8. */
export function deBase64(b64) {
  const binario = atob(String(b64 ?? '').replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)));
}

/**
 * ¿Son la misma vitrina? Se comparan los productos, no el formato: dos
 * archivos con distinta sangría o distinto `_ayuda` son la misma vitrina.
 *
 * @param {any} a — vitrina (objeto) o su texto
 * @param {any} b — vitrina (objeto) o su texto
 */
export function mismaVitrina(a, b) {
  const productos = (v) => {
    let o = v;
    if (typeof v === 'string') {
      try {
        o = JSON.parse(v);
      } catch {
        return null;
      }
    }
    return JSON.stringify(Array.isArray(o) ? o : (o?.productos ?? null));
  };
  const pa = productos(a);
  return pa !== null && pa === productos(b);
}

/** «Arukado69/KalidaPresio» y «main» desde la URL del editor de GitHub. */
export function repoDesdeUrlEditor(url) {
  const m = String(url ?? '').match(/github\.com\/([^/]+\/[^/]+)\/edit\/([^/]+)\//);
  return m ? { repo: m[1], rama: m[2] } : { repo: REPO_POR_DEFECTO, rama: RAMA_POR_DEFECTO };
}

const esTokenRechazado = (status) => status === 401 || status === 403 || status === 404;

/**
 * Publica `contenido` (el texto completo de vitrina.json).
 *
 * @param {{
 *   token: string, contenido: string, base?: any, repo?: string, rama?: string,
 *   mensaje?: string, forzar?: boolean, fetch?: typeof fetch,
 * }} opciones — `base`: la vitrina que el panel cree publicada; `forzar`
 *   escribe aunque GitHub ya no coincida con ella.
 * @returns {Promise<
 *   {ok: true, sinCambios?: boolean, sha?: string, url?: string} |
 *   {ok: false, motivo: 'token'|'conflicto'|'red'|'github', detalle: string, remoto?: string}
 * >}
 */
export async function publicarVitrina({
  token,
  contenido,
  base = null,
  repo = REPO_POR_DEFECTO,
  rama = RAMA_POR_DEFECTO,
  mensaje = 'vitrina: actualizada desde el panel',
  forzar = false,
  fetch: f = globalThis.fetch,
}) {
  if (!token) return { ok: false, motivo: 'token', detalle: 'falta el token' };
  const api = `https://api.github.com/repos/${repo}/contents/${RUTA_VITRINA}`;
  const cabeceras = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${String(token).trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // 1) Lo que hay ahora en GitHub: su sha y su contenido.
  let r;
  try {
    r = await f(`${api}?ref=${encodeURIComponent(rama)}`, { headers: cabeceras, cache: 'no-store' });
  } catch (e) {
    return { ok: false, motivo: 'red', detalle: e?.message ?? String(e) };
  }
  if (esTokenRechazado(r.status)) {
    return { ok: false, motivo: 'token', detalle: `GitHub respondió ${r.status} al leer la vitrina` };
  }
  if (!r.ok) return { ok: false, motivo: 'github', detalle: `GitHub respondió ${r.status} al leer la vitrina` };
  const actual = await r.json();
  const remoto = deBase64(actual.content);

  if (remoto === contenido) return { ok: true, sinCambios: true, sha: actual.sha };

  // 2) Alguien la cambió por otro lado: no se pisa sin preguntar.
  if (!forzar && base != null && !mismaVitrina(remoto, base)) {
    return { ok: false, motivo: 'conflicto', detalle: 'la vitrina en GitHub cambió desde la última vez', remoto };
  }

  // 3) Escribir, con el sha leído: si cambió entre medias, GitHub responde 409.
  try {
    r = await f(api, {
      method: 'PUT',
      headers: { ...cabeceras, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: mensaje, content: aBase64(contenido), sha: actual.sha, branch: rama }),
    });
  } catch (e) {
    return { ok: false, motivo: 'red', detalle: e?.message ?? String(e) };
  }
  if (r.status === 409) return { ok: false, motivo: 'conflicto', detalle: 'la vitrina cambió mientras se publicaba' };
  if (esTokenRechazado(r.status)) {
    return { ok: false, motivo: 'token', detalle: `GitHub respondió ${r.status} al escribir (¿el token tiene Contents: escritura?)` };
  }
  if (!r.ok) return { ok: false, motivo: 'github', detalle: `GitHub respondió ${r.status} al escribir la vitrina` };
  const j = await r.json();
  return { ok: true, sha: j?.content?.sha, url: j?.commit?.html_url };
}
