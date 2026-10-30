/**
 * alarmaVitrina — ¿Está publicando el sitio? ¿Qué hay que revisar esta semana?
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * El 28 de octubre de 2026 el sitio quedó en producción con 0 ofertas: los
 * productos de la vitrina no tenían link oficial, el build los apartó con su
 * motivo y salió en verde, el deploy también, y el bot de Telegram se quedó
 * sin nada que publicar. Nadie se enteró. Es la tercera vez que el proyecto
 * falla en silencio (43 días con el scraper muerto, 16 con el deploy roto).
 *
 * La alarma vieja (alarma-feed) vigilaba al scraper, que ya no corre. Esta
 * vigila lo que importa en el modelo de la vitrina:
 *
 *   🔴 alarma — el sitio no está publicando lo que debe: la vitrina tiene
 *      menos productos publicables que el mínimo, o lo que está EN VIVO está
 *      vacío, viejo o no responde.
 *   🟡 aviso  — productos cuyo precio se esconde en menos de `horasAviso`
 *      porque nadie lo ha vuelto a revisar (la regla de los 7 días).
 *
 * Mira las dos cosas a propósito: el archivo dice qué VA a salir; el feed en
 * vivo dice qué ve la gente HOY. Un deploy roto solo se nota en el segundo.
 *
 * Funciones PURAS: se les pasa el archivo, el feed y el instante. Sin disco,
 * sin red. El script (src/scripts/revisarVitrina.js) hace la entrada/salida.
 */
import { cargarVitrina, DIAS_VIGENCIA_PRECIO } from './vitrina.js';
import { cuandoTermina } from './publicacion.js';

const HORA = 3_600_000;
const DIA = 24 * HORA;

/** Menos productos publicables que esto es un sitio que no sirve. */
export const MINIMO_PUBLICABLES = 3;

/** Con cuánta anticipación se avisa que un precio está por esconderse. */
export const HORAS_AVISO = 48;

/**
 * El sitio se reconstruye cada día (deploy.yml). Un feed en vivo más viejo
 * que esto es un deploy que dejó de correr. Margen para los retrasos del cron
 * de GitHub, que con carga llegan a ser de una hora o más.
 */
export const MAX_HORAS_SIN_BUILD = 30;

const MARCA = /<!--\s*kp-alarma:([^>]*)-->/;

/**
 * Lo que sale del archivo src/data/vitrina.json.
 *
 * @param {any} crudo — vitrina.json ya parseado
 * @param {{ahora?: number, minimo?: number, horasAviso?: number}} [opciones]
 */
export function evaluarVitrina(crudo, { ahora = Date.now(), minimo = MINIMO_PUBLICABLES, horasAviso = HORAS_AVISO } = {}) {
  const { productos, descartes } = cargarVitrina(crudo, ahora);
  const problemas = [];

  if (productos.length < minimo) {
    problemas.push({
      clave: productos.length === 0 ? 'vacia' : 'pocos',
      texto: `La vitrina tiene ${productos.length} producto(s) publicable(s); el mínimo es ${minimo}.`,
    });
  }

  // Las relámpago se van solas en horas: avisar de eso sería ruido.
  const porCaducar = productos
    .filter((p) => !p.oferta_relampago)
    .map((p) => ({ id: p.id, titulo: p.titulo, revisado: p.revisado, vence: Date.parse(p.revisado) + DIAS_VIGENCIA_PRECIO * DIA }))
    .filter((p) => p.vence - ahora <= horasAviso * HORA)
    .sort((a, b) => a.vence - b.vence);

  return { publicables: productos.length, porCaducar, descartes, problemas };
}

/**
 * Lo que está publicado de verdad: el /data/feed.json del sitio en vivo.
 *
 * @param {any} feed — feed.json ya parseado, o null si no se pudo leer
 * @param {{ahora?: number, minimo?: number, maxHorasSinBuild?: number}} [opciones]
 * @returns {{clave: string, texto: string}[]}
 */
export function evaluarEnVivo(feed, { ahora = Date.now(), minimo = MINIMO_PUBLICABLES, maxHorasSinBuild = MAX_HORAS_SIN_BUILD } = {}) {
  if (!feed || typeof feed !== 'object' || Array.isArray(feed)) {
    return [{ clave: 'sin-respuesta', texto: 'El sitio en vivo no respondió con /data/feed.json: ¿está caído?' }];
  }
  if (feed.esquema !== 2) {
    // Recortado y en una línea: este texto puede acabar en el título del issue.
    const visto = String(feed.esquema ?? '(ninguno)').replace(/\s+/g, ' ').slice(0, 20);
    return [{ clave: 'esquema', texto: `El feed en vivo tiene esquema ${visto}; se esperaba el 2.` }];
  }

  const problemas = [];
  const items = Array.isArray(feed.items) ? feed.items : [];
  if (items.length < minimo) {
    problemas.push({
      clave: items.length === 0 ? 'en-vivo-vacio' : 'en-vivo-pocos',
      texto: `El sitio en vivo muestra ${items.length} producto(s).`,
    });
  }

  // La regla de los 7 días se aplica al CONSTRUIR: si el sitio no se
  // reconstruye, un precio vencido sigue publicado como si nada.
  const vencidos = items.filter((i) => !i.relampago && ahora - Date.parse(i.revisado ?? '') > DIAS_VIGENCIA_PRECIO * DIA);
  if (vencidos.length) {
    problemas.push({
      clave: 'en-vivo-vencidos',
      texto: `El sitio en vivo muestra ${vencidos.length} precio(s) con más de ${DIAS_VIGENCIA_PRECIO} días sin revisar: le falta reconstruirse.`,
    });
  }

  const edad = (ahora - Date.parse(feed.generadoEl ?? '')) / HORA;
  if (!Number.isFinite(edad)) {
    problemas.push({ clave: 'sin-build', texto: 'El feed en vivo no dice cuándo se construyó (`generadoEl`).' });
  } else if (edad > maxHorasSinBuild) {
    problemas.push({
      clave: 'sin-build',
      texto: `El sitio no se reconstruye desde hace ${Math.round(edad)} h (debería hacerlo cada día): ¿falló el deploy?`,
    });
  }

  return problemas;
}

/**
 * Junta las dos miradas en un estado y en las CLAVES que lo identifican.
 * Las claves viajan escondidas en el issue: así la corrida siguiente sabe
 * qué es nuevo y solo avisa de eso (una alarma que repite lo mismo cada día
 * se acaba ignorando).
 *
 * @param {ReturnType<typeof evaluarVitrina>} vitrina
 * @param {ReturnType<typeof evaluarEnVivo>} enVivo
 */
export function diagnosticar(vitrina, enVivo) {
  const problemas = [...vitrina.problemas, ...enVivo];
  const estado = problemas.length ? 'alarma' : vitrina.porCaducar.length ? 'aviso' : 'ok';
  const claves = [
    ...problemas.map((p) => p.clave),
    ...vitrina.porCaducar.map((p) => `caduca:${p.id}@${p.revisado}`),
  ];
  return { ...vitrina, problemas, estado, claves };
}

/**
 * Las claves del diagnóstico que el issue anterior todavía no mencionaba.
 * Sin issue anterior, ninguna es «novedad»: abrir el issue ya avisa.
 *
 * @param {string|null|undefined} cuerpoAnterior
 * @param {string[]} claves
 * @returns {string[]}
 */
export function novedades(cuerpoAnterior, claves) {
  const m = String(cuerpoAnterior ?? '').match(MARCA);
  if (!m) return [];
  const antes = new Set(m[1].trim().split(/\s+/).filter(Boolean));
  return (claves ?? []).filter((c) => !antes.has(c));
}

const fechaMx = (t) => new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(t);

function lineaCaduca(p, ahora) {
  const cuando = p.vence <= ahora ? 'ya debió esconderse' : `se esconde ${cuandoTermina(new Date(p.vence).toISOString(), ahora)}`;
  return `- **${p.titulo}** — ${cuando} si no lo vuelves a revisar.`;
}

/**
 * El texto del issue. Corto y con los pasos: quien lo abre desde el celular
 * tiene que saber qué hacer sin abrir el código.
 *
 * @param {ReturnType<typeof diagnosticar>} d
 * @param {{sitio?: string, ahora?: number, minimo?: number, horasAviso?: number, nuevas?: string[]}} [opciones]
 * @returns {{titulo: string, cuerpo: string, comentario: string}}
 */
export function redactar(d, { sitio = '', ahora = Date.now(), minimo = MINIMO_PUBLICABLES, horasAviso = HORAS_AVISO, nuevas = [] } = {}) {
  const base = sitio.replace(/\/+$/, '');
  const hay = (clave) => d.problemas.some((p) => p.clave === clave);
  // El título va corto: el primer problema hasta su primer «: » o punto final.
  const titulo = d.estado === 'alarma'
    ? (hay('en-vivo-vacio') ? '🔴 El sitio está publicando 0 ofertas'
      : hay('vacia') ? '🔴 La vitrina se quedó sin productos publicables'
      : `🔴 Vitrina: ${d.problemas[0].texto.replace(/[.:]\s.*$|\.$/, '')}`)
    : d.estado === 'aviso'
      ? `🟡 ${d.porCaducar.length} producto(s) de la vitrina se esconden en menos de ${horasAviso} h`
      : '✅ Vitrina en orden';

  const lineas = [
    `**Estado:** ${d.estado === 'alarma' ? '🔴 alarma' : d.estado === 'aviso' ? '🟡 aviso' : '✅ en orden'} · ${d.publicables} producto(s) publicable(s) · revisado el ${fechaMx(ahora)} (hora de CDMX)`,
  ];

  if (d.problemas.length) {
    lineas.push('', '### Lo que hay que atender', ...d.problemas.map((p) => `- ${p.texto}`));
  }
  if (d.porCaducar.length) {
    lineas.push('', `### Por esconderse (menos de ${horasAviso} h)`, ...d.porCaducar.map((p) => lineaCaduca(p, ahora)));
  }
  if (d.descartes.length) {
    lineas.push('', '### Fuera de la publicación', ...d.descartes.map((x) => `- #${x.indice + 1} ${x.titulo ?? '(sin título)'} — ${x.motivo}`));
  }

  lineas.push(
    '',
    '### Qué hacer',
    `1. Abre [/panel/agregar](${base}/panel/agregar): ahí ves cada producto con lo que le falta.`,
    '2. Para un precio por esconderse, abre la ficha en Mercado Libre; si sigue igual, toca «Ya revisé: sigue igual». Si cambió, usa el marcador.',
    `3. Sube vitrina.json (botones de abajo del panel). El sitio se reconstruye solo; ${minimo} productos es el mínimo para que no se vea vacío.`,
    '4. Si el problema es del sitio en vivo y la vitrina está bien, revisa la última corrida de «Desplegar en Hetzner» en Actions.',
    '',
    '_Este issue se actualiza en cada revisión y se cierra solo cuando todo está en orden._',
    `<!-- kp-alarma: ${d.claves.join(' ')} -->`,
  );

  const textoDe = (clave) => {
    const p = d.problemas.find((x) => x.clave === clave);
    if (p) return `- ${p.texto}`;
    const c = d.porCaducar.find((x) => clave === `caduca:${x.id}@${x.revisado}`);
    return c ? lineaCaduca(c, ahora) : null;
  };
  const comentario = nuevas.length
    ? ['**Novedades desde la última revisión:**', '', ...nuevas.map(textoDe).filter(Boolean)].join('\n')
    : '';

  return { titulo, cuerpo: lineas.join('\n') + '\n', comentario };
}
