/**
 * mlPayload — Lectura de las tarjetas de Mercado Libre. Fuente ÚNICA.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * El 8 de julio de 2026 Mercado Libre renombró los componentes de sus tarjetas
 * y el pipeline se murió en silencio durante 43 días: `importarOfertas.js`
 * buscaba `reviews`, no lo encontraba, dejaba `rating = 0` en los 41 productos,
 * y la guillotina `rating === 0` los tiraba todos. El step de CI fallaba, no
 * commiteaba, y la web se quedó sirviendo el feed de julio sin que nada avisara.
 *
 * Ese fallo costó tanto porque la lectura del payload estaba COPIADA en dos
 * scrapers con distinta resistencia. Aquí vive una sola vez, es pura y está
 * cubierta por tests: cuando ML vuelva a mover algo —que lo hará— se arregla
 * en un sitio y los tests dicen exactamente qué se rompió.
 *
 * ── CAMBIOS DE ML OBSERVADOS (agosto 2026) ─────────────────────────────────
 *   reviews            → review_compacted   (y ya NO da nº de opiniones)
 *   shipping           → shipping_v2
 *   price.previous_price → price.price_labels[].values[].price {previous:true}
 *   price.discount_label → price.discount_polylabel
 *   highlight · highlight_countdown · brand → desaparecidos
 *   promotions         → NUEVO (cupones)
 *
 * El cambio de fondo: donde había **opiniones** ahora hay **vendidos**, y en
 * cubos ("Más de 5mil productos vendidos"), o sea cotas inferiores, no cifras
 * exactas. Se guarda como `vendidos` y se muestra como «+5 mil vendidos»: decir
 * "5.000 opiniones" sería inventar un dato que ML ya no publica.
 */

/** Busca un componente de la tarjeta por tipo. */
const comp = (card, tipo) => card?.components?.find((c) => c.type === tipo);

/** Limpia tokens de icono tipo "{icon_cockade}" y espacios sobrantes. */
export const limpiar = (s) => String(s ?? '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();

/** Formatea un importe como lo escribe ML en México. */
const pesos = (v) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(v) || 0);

/**
 * Resuelve el patrón `text` + `values` que ML usa en TODOS sus bloques:
 * el texto trae marcadores `{clave}` y el valor real vive en `values`.
 *
 *   { text: "Cupón {amount} OFF",
 *     values: [{ key: "amount", type: "price", price: { value: 100 } }] }
 *   → "Cupón $100 OFF"
 *
 * Sin esto se publicaban literales como «Cupón {amount} OFF». Los iconos se
 * descartan (no son texto) y cualquier marcador que no se pueda resolver se
 * elimina en vez de mostrarse crudo.
 */
export function resolverTexto(bloque) {
  if (!bloque?.text) return '';
  const porClave = new Map((bloque.values ?? []).map((v) => [v.key, v]));

  const salida = String(bloque.text).replace(/\{([^}]+)\}/g, (_, clave) => {
    const v = porClave.get(clave);
    if (!v) return '';
    if (v.type === 'icon') return '';
    if (v.price) return pesos(v.price.value);
    return v.label?.text ?? v.pill?.text ?? '';
  });

  return salida.replace(/\s+/g, ' ').trim();
}

/**
 * Calificación de 0 a 5.
 * Se prefiere `alt_text` («Calificación 4.7 de 5 estrellas») porque es texto
 * pensado para lectores de pantalla y cambia menos que la maquetación de
 * `values`. El label suelto queda de respaldo.
 * @returns {number} 0 si no se pudo leer.
 */
export function leerRating(card) {
  const r = comp(card, 'review_compacted')?.review_compacted;
  if (!r) return 0;

  const porAlt = String(r.alt_text ?? '').match(/calificaci[oó]n\s+([\d]+(?:[.,]\d+)?)\s+de\s+5/i);
  if (porAlt) return Number(porAlt[1].replace(',', '.')) || 0;

  const label = (r.values ?? []).find((v) => v.type === 'label' && /^[\d]+([.,]\d+)?$/.test(String(v.label?.text ?? '').trim()));
  if (label) return Number(String(label.label.text).trim().replace(',', '.')) || 0;

  return 0;
}

/**
 * Unidades vendidas, como COTA INFERIOR.
 * ML publica cubos: 100, 500, 1000, 5mil, 10mil, 50mil, 100mil, 250mil…
 * «5mil» → 5000. Devuelve 0 si la tarjeta no lo trae.
 * @returns {number}
 */
export function leerVendidos(card) {
  const r = comp(card, 'review_compacted')?.review_compacted;
  if (!r) return 0;

  const textos = [
    r.alt_text,
    ...(r.values ?? []).map((v) => v.label?.text),
  ].filter(Boolean).map(String);

  for (const t of textos) {
    // "Más de 5mil productos vendidos"  ·  "| +5mil vendidos"  ·  "+500 vendidos"
    const m = t.match(/(?:m[aá]s de|\+)\s*([\d.,]+)\s*(mil|k)?\s*(?:productos\s+)?vendidos/i);
    if (!m) continue;
    const n = Number(m[1].replace(/[.,]/g, ''));
    if (!Number.isFinite(n)) continue;
    return m[2] ? n * 1000 : n;
  }
  return 0;
}

/**
 * Precios y descuento REAL.
 * `current_price` sobrevivió al cambio; el precio previo se mudó dentro de
 * `price_labels` y la etiqueta de descuento pasó a `discount_polylabel`.
 * @returns {{actual: number, previo: number|null, descuento: number}}
 */
export function leerPrecios(card) {
  const p = comp(card, 'price')?.price;
  if (!p) return { actual: 0, previo: null, descuento: 0 };

  const actual = Number(p.current_price?.value) || 0;

  const previo = (p.price_labels ?? [])
    .flatMap((l) => l.values ?? [])
    .map((v) => (v.price?.previous ? Number(v.price.value) : null))
    .find((v) => Number.isFinite(v) && v > 0) ?? null;

  // 1º la etiqueta que ML ya calculó ("29% OFF"): es la que ve el comprador.
  let descuento = 0;
  const pill = (p.discount_polylabel?.values ?? [])
    .map((v) => v.pill?.text || v.label?.text)
    .find(Boolean);
  const md = String(pill ?? '').match(/(\d+)\s*%/);
  if (md) descuento = parseInt(md[1], 10);

  // 2º si no hay etiqueta, se deduce del precio previo.
  if (!descuento && previo && previo > actual && actual > 0) {
    descuento = Math.round((1 - actual / previo) * 100);
  }

  return { actual, previo, descuento };
}

/**
 * ¿Envío gratis? El bloque `shipping_v2` mezcla pills y labels; basta con que
 * alguno diga "gratis" ("Envío gratis", "Llega gratis mañana"). Ojo: "Llega
 * mañana" a secas NO es gratis.
 * @returns {boolean}
 */
export function leerEnvioGratis(card) {
  const bloques = comp(card, 'shipping_v2')?.shipping_v2 ?? [];
  return bloques
    .flatMap((b) => b.values ?? [])
    .some((v) => /gratis/i.test(v.pill?.text || v.label?.text || ''));
}

/**
 * Vendedor y si luce el icono de reputación (`{icon_cockade}`).
 * Este componente NO cambió.
 * @returns {{nombre: string|null, confiable: boolean}}
 */
export function leerVendedor(card) {
  const txt = comp(card, 'seller')?.seller?.text ?? '';
  const nombre = limpiar(txt).replace(/^por\s+/i, '') || null;
  return { nombre, confiable: /cockade/i.test(txt) };
}

/**
 * Cupón adicional, si lo hay ("Cupón 10% OFF"). Señal nueva de agosto 2026:
 * es un descuento EXTRA sobre el precio mostrado.
 * @returns {string|null}
 */
export function leerCupon(card) {
  const promos = comp(card, 'promotions')?.promotions ?? [];
  const cupon = promos.find((p) => p.type === 'coupon' && p.text);
  if (!cupon) return null;
  // ML manda el importe en `values` («Cupón {amount} OFF»); sin resolverlo se
  // publicaba el marcador crudo.
  const texto = resolverTexto(cupon);
  return texto || null;
}

/** Título del producto. */
export function leerTitulo(card) {
  return comp(card, 'title')?.title?.text ?? null;
}

/** URL absoluta del producto (ML la manda sin esquema). */
export function leerUrl(card) {
  const u = card?.metadata?.url;
  if (!u) return null;
  return String(u).startsWith('http') ? String(u) : `https://${u}`;
}

/** Imagen principal, en el CDN de ML. */
export function leerImagen(card) {
  const id = card?.pictures?.pictures?.[0]?.id;
  return id ? `https://http2.mlstatic.com/D_NQ_NP_${id}-O.webp` : null;
}

/**
 * Lee una tarjeta entera al shape canónico del feed.
 * Devuelve null si la tarjeta no trae lo mínimo (id, título, precio).
 *
 * @param {object} item — elemento de pageProps.data.items
 * @param {(url: string) => string} aAfiliado — cómo convertir la URL en link de afiliado
 * @returns {object|null}
 */
export function leerTarjeta(item, aAfiliado = (u) => u) {
  const card = item?.card;
  if (!card) return null;

  const id = card.metadata?.id;
  const titulo = leerTitulo(card);
  const { actual, previo, descuento } = leerPrecios(card);
  const url = leerUrl(card);
  if (!id || !titulo || !actual || !url) return null;

  const vendedor = leerVendedor(card);

  return {
    id,
    titulo,
    precio_actual: actual,
    precio_previo: previo,
    descuento,
    rating: leerRating(card),
    vendidos: leerVendidos(card),
    link_afiliado: aAfiliado(url),
    imagen: leerImagen(card),
    // Señal nueva: descuento EXTRA que no viene descontado del precio.
    cupon: leerCupon(card),
    vendedor: vendedor.nombre,
    vendedor_confiable: vendedor.confiable,
    envio_gratis: leerEnvioGratis(card),
    // ML dejó de publicar la fecha de fin de las relámpago en la tarjeta.
    // Se conserva el campo para no romper a los consumidores; siempre null.
    fin_oferta: null,
  };
}

/**
 * Cuántas unidades vendidas, dicho como lo dice ML: una cota inferior.
 * «+5 mil vendidos», no «5.000 vendidos».
 * @param {number} n
 * @returns {string}
 */
export function formatearVendidos(n) {
  const v = Number(n) || 0;
  if (v <= 0) return '';
  if (v >= 1000) {
    const miles = v / 1000;
    return `+${miles >= 10 ? Math.round(miles) : Number(miles.toFixed(1))} mil vendidos`;
  }
  return `+${v.toLocaleString('es-MX')} vendidos`;
}
