/**
 * publicacion — Cómo se escribe una oferta en cada red. Sin DOM, sin red.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * Publicar a diario en cinco redes solo se sostiene si cada publicación sale
 * en dos toques. Cada red tiene su propio formato: WhatsApp usa *negritas*,
 * Telegram **negritas**, Facebook no da formato, e Instagram y TikTok no
 * permiten links en el texto (por eso apuntan a /hoy, la página de «link en
 * mi perfil», con el NÚMERO del producto).
 *
 * El panel /panel/hoy usa estas funciones en el navegador; viven aquí para
 * que se puedan probar y para que el texto sea el mismo en todas partes.
 *
 * ── LAS DOS REGLAS QUE NO SE NEGOCIAN ──────────────────────────────────────
 *  1. El link es el OFICIAL de la vitrina, el del canal si lo generaste con
 *     su etiqueta (enlacePara). Nunca se arma ni se edita uno.
 *  2. Toda publicación declara que es de afiliado. Es lo que piden Mercado
 *     Libre y la PROFECO, y tu marca entera es decir la verdad sobre precios.
 */
import { enlacePara } from './vitrina.js';

/**
 * Formatos del panel. `canal` decide qué link oficial se usa; `imagen` qué
 * tarjeta conviene: `post` (4:5, feed) o `historia` (9:16, estados/reels).
 */
export const FORMATOS = Object.freeze([
  { id: 'wa', canal: 'wa', nombre: 'WhatsApp', detalle: 'canal o grupo', imagen: 'post' },
  { id: 'estado', canal: 'wa', nombre: 'Estado de WhatsApp', detalle: 'imagen vertical + texto corto', imagen: 'historia' },
  { id: 'tg', canal: 'tg', nombre: 'Telegram', detalle: 'canal o grupo', imagen: 'post' },
  { id: 'fb', canal: 'fb', nombre: 'Facebook', detalle: 'página o grupo', imagen: 'post' },
  { id: 'ig', canal: 'ig', nombre: 'Instagram', detalle: 'post, reel o historia', imagen: 'historia' },
  { id: 'tt', canal: 'tt', nombre: 'TikTok', detalle: 'video corto', imagen: 'historia' },
  { id: 'pn', canal: 'pn', nombre: 'Pinterest', detalle: 'pin con link', imagen: 'post' },
  { id: 'cr', canal: 'cr', nombre: 'Correo', detalle: 'boletín', imagen: 'post' },
]);

/** Formatos donde el texto no puede llevar un link que se pueda tocar. */
const SIN_LINK = new Set(['ig', 'tt']);

/**
 * Horas para repartir las publicaciones del día. La ventana para que una
 * compra cuente después del clic es corta, así que varias ofertas buenas a lo
 * largo del día rinden más que un bloque grande de una vez.
 */
export const HORARIOS_SUGERIDOS = Object.freeze(['08:30', '12:30', '15:30', '19:00', '21:30']);

export const AVISO_AFILIADO = 'Enlace de afiliado: si compras, recibo una comisión sin costo extra para ti.';

const ZONA = 'America/Mexico_City';

const pesos = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n) || 0);

const diaMx = (t) => new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
const horaMx = (t) => new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }).format(t);
const fechaCorta = (t) => new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, day: 'numeric', month: 'short' }).format(t);

/**
 * «hoy a las 23:00», «mañana a las 10:00», «el 30 oct a las 18:00».
 * Solo para una hora de fin REAL; null si no hay.
 *
 * @param {string|null|undefined} iso
 * @param {number} [ahora]
 * @returns {string|null}
 */
export function cuandoTermina(iso, ahora = Date.now()) {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return null;
  const dia = diaMx(t);
  const cuando = dia === diaMx(ahora) ? 'hoy'
    : dia === diaMx(ahora + 86_400_000) ? 'mañana'
    : `el ${fechaCorta(t)}`;
  return `${cuando} a las ${horaMx(t)}`;
}

/** Corta un título largo sin dejarlo a media palabra. */
export function recortar(texto, max) {
  const s = String(texto ?? '').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[\s,.;:-]+$/, '') + '…';
}

/** Los datos que comparten todas las plantillas. */
function base(p, ahora) {
  const precio = pesos(p.precio_actual);
  const antes = p.precio_previo && p.precio_previo > p.precio_actual ? pesos(p.precio_previo) : null;
  const descuento = antes && p.descuento > 0 ? `−${p.descuento}%` : null;
  const senales = [
    p.rating ? `${Number(p.rating).toFixed(1)}★` : null,
    p.vendidos >= 1000 ? `+${Math.round(p.vendidos / 1000)} mil vendidos` : p.vendidos > 0 ? `+${p.vendidos} vendidos` : null,
    p.envio_gratis ? 'envío gratis' : null,
  ].filter(Boolean);
  const termina = p.oferta_relampago ? cuandoTermina(p.fin_oferta, ahora) : null;
  const visto = p.revisado ? fechaCorta(Date.parse(p.revisado)) : null;
  return { precio, antes, descuento, senales, termina, visto };
}

function hashtags(p) {
  const tags = ['#ofertas', '#mercadolibre', '#ofertasmexico'];
  if (p.oferta_relampago) tags.push('#ofertarelampago');
  tags.push('#publicidad', '#afiliado');
  return tags.join(' ');
}

/**
 * La publicación de UN producto para un formato.
 *
 * @param {string} formato — id de FORMATOS
 * @param {object} p — producto de la vitrina (shape canónico)
 * @param {{numero?: number, sitio?: string, ahora?: number}} [opciones]
 * @returns {string}
 */
export function textoProducto(formato, p, { numero, sitio = '', ahora = Date.now() } = {}) {
  const f = FORMATOS.find((x) => x.id === formato) ?? FORMATOS[0];
  const b = base(p, ahora);
  const link = enlacePara(p, f.canal);
  const hoy = `${sitio.replace(/\/+$/, '')}/hoy`;
  const etiqueta = p.oferta_relampago ? '⚡ OFERTA RELÁMPAGO' : '🔥 OFERTA';
  const precioPlano = [b.precio, b.antes ? `(antes ${b.antes}${b.descuento ? `, ${b.descuento}` : ''})` : null].filter(Boolean).join(' ');
  const pie = `${AVISO_AFILIADO}${b.visto ? ` Precio visto el ${b.visto}; confírmalo en Mercado Libre.` : ''}`;

  switch (f.id) {
    case 'wa':
      return [
        `*${etiqueta}*`,
        `*${p.titulo}*`,
        '',
        `💰 *${b.precio}*${b.antes ? ` ~${b.antes}~` : ''}${b.descuento ? ` (${b.descuento})` : ''}`,
        b.senales.length ? `⭐ ${b.senales.join(' · ')}` : null,
        b.termina ? `⏱ Termina ${b.termina}` : null,
        p.nota ? `📝 ${p.nota}` : null,
        '',
        `👉 ${link}`,
        '',
        `_${pie}_`,
      ].filter((l) => l !== null).join('\n');

    case 'estado':
      return [
        `${p.oferta_relampago ? '⚡' : '🔥'} ${recortar(p.titulo, 60)}`,
        `💰 ${b.precio}${b.descuento ? ` (${b.descuento})` : ''}${b.termina ? ` · termina ${b.termina}` : ''}`,
        `👉 ${link}`,
        '#afiliado',
      ].join('\n');

    case 'tg':
      return [
        `**${etiqueta}**`,
        `**${p.titulo}**`,
        '',
        `💰 **${b.precio}**${b.antes ? ` ~~${b.antes}~~` : ''}${b.descuento ? ` (${b.descuento})` : ''}`,
        b.senales.length ? `⭐ ${b.senales.join(' · ')}` : null,
        b.termina ? `⏱ Termina ${b.termina}` : null,
        p.nota ? `📝 ${p.nota}` : null,
        '',
        `👉 ${link}`,
        '',
        `__${pie}__`,
      ].filter((l) => l !== null).join('\n');

    case 'fb':
      return [
        `${etiqueta} · ${p.titulo}`,
        '',
        `💰 ${precioPlano}`,
        b.senales.length ? `⭐ ${b.senales.join(' · ')}` : null,
        b.termina ? `⏱ Termina ${b.termina}` : null,
        p.nota ? `📝 ${p.nota}` : null,
        '',
        `👉 ${link}`,
        '',
        pie,
      ].filter((l) => l !== null).join('\n');

    case 'ig':
    case 'tt': {
      const donde = numero ? `🔗 Link en mi perfil → busca el #${numero}` : '🔗 Link en mi perfil';
      return [
        `${p.oferta_relampago ? '⚡' : '🔥'} ${recortar(p.titulo, f.id === 'tt' ? 80 : 120)}`,
        `💰 ${b.precio}${b.antes ? ` (antes ${b.antes})` : ''}${b.descuento ? ` ${b.descuento}` : ''}`,
        b.termina ? `⏱ Termina ${b.termina}` : null,
        p.nota && f.id === 'ig' ? `📝 ${p.nota}` : null,
        donde,
        `(${hoy})`,
        '',
        'Enlace de afiliado: si compras, recibo una comisión sin costo extra para ti.',
        hashtags(p),
      ].filter((l) => l !== null).join('\n');
    }

    case 'pn':
      return [
        recortar(p.titulo, 100),
        '',
        `${precioPlano}.${b.senales.length ? ` ${b.senales.join(' · ')}.` : ''}${p.nota ? ` ${p.nota}` : ''}`,
        `Link: ${link}`,
        AVISO_AFILIADO,
      ].join('\n');

    case 'cr':
    default:
      return [
        `Asunto: ${p.oferta_relampago ? '⚡ ' : ''}${recortar(p.titulo, 60)} a ${b.precio}`,
        '',
        p.titulo,
        precioPlano,
        b.senales.length ? b.senales.join(' · ') : null,
        b.termina ? `Termina ${b.termina}.` : null,
        p.nota ?? null,
        '',
        `Verlo en Mercado Libre: ${link}`,
        '',
        pie,
      ].filter((l) => l !== null).join('\n');
  }
}

/**
 * El «paquete relámpago»: un solo mensaje con varias ofertas, para mandar de
 * una vez a un canal o grupo. En Instagram y TikTok sale como lista numerada
 * sin links (apunta a /hoy).
 *
 * @param {string} formato
 * @param {object[]} productos — ya ordenados (ordenParaPublicar)
 * @param {{sitio?: string, ahora?: number, max?: number}} [opciones]
 * @returns {string}
 */
export function textoPaquete(formato, productos, { sitio = '', ahora = Date.now(), max = 5 } = {}) {
  const f = FORMATOS.find((x) => x.id === formato) ?? FORMATOS[0];
  const lote = (productos ?? []).slice(0, max);
  if (lote.length === 0) return '';
  const hoy = `${sitio.replace(/\/+$/, '')}/hoy`;
  const hayRelampago = lote.some((p) => p.oferta_relampago);
  const titulo = hayRelampago ? '⚡ RELÁMPAGOS Y OFERTAS DE HOY' : '🔥 OFERTAS DE HOY';
  const negrita = f.id === 'wa' ? (t) => `*${t}*` : f.id === 'tg' ? (t) => `**${t}**` : (t) => t;

  if (SIN_LINK.has(f.id) || f.id === 'estado') {
    const lineas = [
      titulo,
      ...lote.map((p, i) => `#${i + 1} ${recortar(p.titulo, 45)} — ${pesos(p.precio_actual)}`),
      '',
      // El estado de WhatsApp sí admite un link que se toca: va directo a /hoy.
      f.id === 'estado' ? `👉 ${hoy}` : `🔗 Todas en el link de mi perfil (${hoy})`,
      'Enlaces de afiliado: si compras, recibo una comisión sin costo extra para ti.',
    ];
    if (f.id !== 'estado') lineas.push('#ofertas #mercadolibre #publicidad #afiliado');
    return lineas.join('\n');
  }

  return [
    negrita(titulo),
    '',
    ...lote.flatMap((p, i) => {
      const b = base(p, ahora);
      return [
        `${i + 1}. ${negrita(recortar(p.titulo, 70))}`,
        `   ${b.precio}${b.descuento ? ` (${b.descuento})` : ''}${b.termina ? ` · termina ${b.termina}` : ''}`,
        `   👉 ${enlacePara(p, f.canal)}`,
      ];
    }),
    '',
    'Enlaces de afiliado: si compras, recibo una comisión sin costo extra para ti. Precios del momento en que los vi; confírmalos en Mercado Libre.',
  ].join('\n');
}

/**
 * Una idea de video de 15 segundos para Reels/TikTok. No es un guion cerrado:
 * es lo mínimo para grabar con el teléfono sin pensar.
 *
 * @param {object} p
 * @param {number} [numero]
 * @returns {string}
 */
export function ideaVideo(p, numero) {
  const b = base(p, Date.now());
  return [
    `0–3 s · Gancho: «${b.descuento ? `${b.descuento} en ` : ''}${recortar(p.titulo, 40)}${b.antes ? `: de ${b.antes} a ${b.precio}` : ` a ${b.precio}`}».`,
    '3–10 s · Muéstralo (foto o el producto real) y di UNA razón para comprarlo' + (p.nota ? `: «${p.nota}».` : '.'),
    `10–15 s · Cierre: «Link en mi perfil${numero ? `, el número ${numero}` : ''}». Menciona que es enlace de afiliado.`,
  ].join('\n');
}

/**
 * Reparte productos en los horarios sugeridos, en orden.
 * @param {object[]} productos
 * @returns {{hora: string, producto: object}[]}
 */
export function repartirEnHorarios(productos) {
  return HORARIOS_SUGERIDOS.slice(0, (productos ?? []).length).map((hora, i) => ({ hora, producto: productos[i] }));
}
