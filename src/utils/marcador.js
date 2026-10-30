/**
 * marcador — El botón del navegador que lleva un producto de Mercado Libre a
 * tu vitrina.
 *
 * ── POR QUÉ UN MARCADOR ────────────────────────────────────────────────────
 * Mercado Libre bloquea a los servidores (GitHub, el VPS): el sitio ya no
 * puede leer una ficha de producto por su cuenta. Tu navegador sí, porque eres
 * tú, con tu sesión. Este marcador corre EN la página del producto, lee lo que
 * ya está ahí (título, precio, foto, calificación, vendidos) y lo manda a
 * /panel/agregar. Lo único que te pide es el link oficial, que generas con la
 * barra azul de afiliados de esa misma página.
 *
 * ── CÓMO ESTÁ HECHO ────────────────────────────────────────────────────────
 * `marcador` es una función de verdad (se puede leer, probar y editar como
 * código normal). El panel la convierte en un enlace `javascript:` con su
 * propio código fuente. Por eso NO puede usar nada de fuera: ni imports, ni
 * variables del módulo. El sitio entra por el texto `__SITIO__`, que se
 * reemplaza al armar el enlace.
 */

/* eslint-disable no-undef */
export function marcador() {
  var SITIO = '__SITIO__';
  var d = {};

  function texto(sel) {
    var e = document.querySelector(sel);
    return e ? (e.textContent || '').trim() : '';
  }
  function atributo(sel, nombre) {
    var e = document.querySelector(sel);
    return e ? e.getAttribute(nombre) : null;
  }
  // «$1,299» → 1299. Los centavos de ML van en otro nodo, así que no estorban.
  function numero(t) {
    if (t === null || t === undefined) return null;
    var s = String(t).replace(/[^\d.]/g, '');
    if (!s) return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  // 1) Datos estructurados (JSON-LD): lo más estable de la ficha.
  var ld = null;
  document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
    try {
      var j = JSON.parse(s.textContent);
      var lista = Array.isArray(j) ? j : (j['@graph'] || [j]);
      lista.forEach(function (x) {
        if (!ld && x && /Product/.test(String(x['@type']))) ld = x;
      });
    } catch (e) { /* un bloque roto no detiene al resto */ }
  });

  d.titulo = (ld && ld.name) || texto('h1.ui-pdp-title') || atributo('meta[property="og:title"]', 'content') || document.title;

  var imagen = ld && ld.image;
  if (Array.isArray(imagen)) imagen = imagen[0];
  d.imagen = imagen || atributo('meta[property="og:image"]', 'content') || null;

  var oferta = ld && ld.offers;
  if (Array.isArray(oferta)) oferta = oferta[0];
  d.precio = numero(oferta && (oferta.price || oferta.lowPrice))
    || numero(atributo('meta[itemprop="price"]', 'content'))
    || numero(texto('.ui-pdp-price__second-line .andes-money-amount__fraction'));

  d.precio_antes = numero(texto('.ui-pdp-price__original-value .andes-money-amount__fraction'))
    || numero(texto('s.andes-money-amount--previous .andes-money-amount__fraction'));

  var calif = ld && ld.aggregateRating;
  d.rating = numero(calif && calif.ratingValue) || numero(texto('.ui-pdp-review__rating'));

  // «Nuevo | +10mil vendidos» → 10000
  var sub = texto('.ui-pdp-subtitle') + ' ' + texto('.ui-pdp-header__subtitle');
  var mv = sub.match(/\+?\s*([\d.,]+)\s*(mil)?\s*vendid/i);
  if (mv) {
    var v = parseFloat(mv[1].replace(/\./g, '').replace(',', '.'));
    if (isFinite(v)) d.vendidos = Math.round(mv[2] ? v * 1000 : v);
  }

  var cuerpo = (document.querySelector('.ui-pdp-container') || document.body).innerText || '';
  d.envio_gratis = /env[ií]o gratis/i.test(cuerpo);
  d.relampago = /oferta rel[aá]mpago/i.test(cuerpo);
  // La cuenta regresiva de una relámpago: «Termina en 05:23:11»
  var mt = cuerpo.match(/termina en\s*(\d{1,2}):(\d{2}):(\d{2})/i);
  if (mt) {
    var seg = Number(mt[1]) * 3600 + Number(mt[2]) * 60 + Number(mt[3]);
    d.termina = new Date(Date.now() + seg * 1000).toISOString();
  }

  var canonica = atributo('link[rel="canonical"]', 'href') || location.href;
  d.url_producto = canonica.split('?')[0].split('#')[0];

  // El id de ARTÍCULO (la publicación que gana la ficha). La vitrina identifica
  // por catálogo (/p/MLM…), pero el histórico de precios se llenó con ids de
  // artículo: sin este dato el veredicto de precio sale vacío. Solo se lee de
  // lo que habla del producto principal (la URL y el formulario de compra): un
  // id equivocado le pegaría el historial de OTRO producto. Ante la duda, nada;
  // el panel deja escribirlo a mano. Misma regla que idArticulo() en vitrina.js.
  var direccion = location.href;
  try { direccion = decodeURIComponent(direccion); } catch (e) { /* se lee tal cual */ }
  var art = direccion.match(/(?:[?&#]wid=|[?&#=,]item_id[:=])(ML[A-Z])-?(\d{6,})/i);
  if (!art) {
    var compra = document.querySelector('form input[name="item_id"]');
    art = compra ? String(compra.value || '').match(/^\s*(ML[A-Z])-?(\d{6,})\s*$/i) : null;
  }
  if (art) d.id_articulo = art[1].toUpperCase() + art[2];

  // 2) El link oficial. Si ya abriste «Compartir» en la barra de afiliados, el
  //    link está en la página y se toma de ahí; si no, se te pide.
  var oficial = /https:\/\/(meli\.la\/|(www\.)?mercadolibre\.com(\.mx)?\/sec\/)[A-Za-z0-9_-]{4,}/;
  var hallado = '';
  document.querySelectorAll('input, textarea').forEach(function (e) {
    var m = String(e.value || '').match(oficial);
    if (m && !hallado) hallado = m[0];
  });
  if (!hallado) {
    var m2 = String(document.body.innerText || '').match(oficial);
    if (m2) hallado = m2[0];
  }

  var link = window.prompt(
    'KalidaPresio · Pega tu link OFICIAL de afiliado (meli.la/… o mercadolibre.com/sec/…).\n'
    + 'Lo generas con «Compartir» en la barra azul de afiliados de esta página.\n'
    + 'Si lo dejas vacío, lo pegas después en el panel.',
    hallado,
  );
  if (link === null) return;
  d.link = String(link).trim();

  var destino = SITIO + '/panel/agregar#nuevo=' + encodeURIComponent(JSON.stringify(d));
  var ventana = window.open(destino, '_blank');
  if (!ventana) location.href = destino;
}

/**
 * El enlace `javascript:` listo para arrastrar a la barra de marcadores.
 * @param {string} sitio — URL del sitio, sin barra final
 * @returns {string}
 */
export function enlaceMarcador(sitio) {
  const fuente = `(${marcador.toString()})()`.replace('__SITIO__', String(sitio).replace(/\/+$/, ''));
  // encodeURIComponent deja pasar la comilla simple; se codifica también para
  // que el código se pueda pegar tal cual como dirección de un marcador.
  return `javascript:${encodeURIComponent(fuente).replace(/'/g, '%27')}`;
}

/**
 * Lee lo que el marcador manda en `#nuevo=…`. Nunca lanza.
 * @param {string} hash — location.hash
 * @returns {object|null}
 */
export function leerEnvioMarcador(hash) {
  const m = String(hash ?? '').match(/^#nuevo=(.+)$/);
  if (!m) return null;
  try {
    const d = JSON.parse(decodeURIComponent(m[1]));
    return d && typeof d === 'object' && !Array.isArray(d) ? d : null;
  } catch {
    return null;
  }
}
