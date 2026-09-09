/**
 * scrapeOfertas — el núcleo de leer /ofertas de Mercado Libre.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * Esto vivía dentro de importarOfertas.js, que además filtra por calidad y
 * escribe ofertas.json. La pasada del histórico necesita lo mismo pero SIN el
 * filtro y sobre varias páginas, así que o se compartía o se copiaba. Copiar
 * la lectura de ML ya salió caro una vez: cuando ML renombró sus componentes
 * en julio de 2026, la copia que alimentaba el sitio se rompió 43 días en
 * silencio mientras la otra seguía bien.
 *
 * Sin disco y sin filtros de negocio: solo URL, descarga y extracción.
 */

export const URL_OFERTAS = 'https://www.mercadolibre.com.mx/ofertas';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * URL de la página N del listado de ofertas.
 * La 1 va sin query: es la URL canónica y la que el feed del sitio usa.
 *
 * @param {number} [pagina=1]
 * @returns {string}
 */
export function urlPagina(pagina = 1) {
  const n = Number(pagina);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Página inválida: ${pagina}. Debe ser un entero ≥ 1.`);
  }
  return n === 1 ? URL_OFERTAS : `${URL_OFERTAS}?page=${n}`;
}

/**
 * Saca los items del payload embebido en el HTML.
 *
 * LANZA si no lo encuentra, y eso es deliberado: devolver [] haría que quien
 * llama escribiera un feed vacío creyendo que hoy no hubo ofertas.
 *
 * @param {string} html
 * @returns {object[]} items crudos de ML (para pasar a leerTarjeta)
 */
export function extraerAppProps(html) {
  const match = String(html ?? '').match(/"appProps":({.*?}),"mainEntry"/s);
  if (!match) {
    throw new Error('No se encontró "appProps" en el HTML (¿cambió la estructura de ML?).');
  }
  return JSON.parse(match[1]).pageProps.data.items ?? [];
}

/**
 * Descarga una página del listado.
 *
 * @param {number} [pagina=1]
 * @param {{timeoutMs?: number, fetchImpl?: typeof fetch}} [opciones]
 * @returns {Promise<string>} HTML
 */
export async function descargarPagina(pagina = 1, { timeoutMs = 30_000, fetchImpl = fetch } = {}) {
  const url = urlPagina(pagina);
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.9' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  return await res.text();
}
