/**
 * secciones — Cómo se reparte la vitrina en la portada y en /ofertas/<slug>.
 *
 * Antes este módulo leía secciones-feed.json, que raspaba cuatro contenedores
 * de /ofertas de Mercado Libre al inicio de cada build. Desde el 8 de octubre
 * de 2026 ML responde a los servidores con una pantalla de «verifica tu
 * cuenta», así que ese feed no volvió a llenarse. Ahora todo sale de la
 * vitrina (src/data/vitrina.json), los productos que tú eliges con tu link
 * oficial: las secciones son solo filtros sobre ella.
 *
 * Este módulo corre SOLO en Node durante el build (lo importan los
 * frontmatter de .astro). Nada de esto llega al navegador como JS.
 */
import { OFERTAS, GENERADO_EL as REVISION } from './ofertas.js';
import { calcularScorePorSeccion } from '../utils/scoreSecciones.js';

/**
 * Cuándo se revisaron los precios que se muestran (la revisión más vieja).
 * `null` si la vitrina está vacía — y el sitio lo dice en vez de inventar.
 */
export const GENERADO_EL = REVISION;

const conScore = (items) => items
  .map((it) => ({ ...it, score_seccion: calcularScorePorSeccion(it, 'default') }))
  .sort((a, b) => b.score_seccion - a.score_seccion);

/** La rejilla principal de la portada: toda la vitrina menos las relámpago. */
export const CATALOGO = conScore(OFERTAS);

/**
 * Las secciones que tienen PÁGINA PROPIA (/ofertas/<slug>).
 *
 * Relámpago queda fuera a propósito: tiene hora de fin, y una página estática
 * la seguiría mostrando hasta el próximo build. Para eso está el carrusel, que
 * la retira en el navegador al vencer.
 *
 * `campana` viaja en el evento de Umami (data-kp-seccion) para saber qué
 * sección genera clics.
 */
export const SECCIONES_CON_PAGINA = [
  {
    slug: 'menos-500',
    campana: 'menos500',
    titulo: 'Por menos de $500',
    resumen: 'lo mejor que se puede comprar con poco presupuesto',
    descripcion:
      'Las mejores ofertas calidad-precio por menos de $500 pesos en Mercado Libre México. Presupuesto ajustado sin renunciar a la calidad, según el Sello K-P.',
    items: CATALOGO.filter((it) => it.precio_actual < 500),
  },
// Una página con cuatro productos no le sirve a nadie ni rankea. Si una
// sección viene famélica, simplemente no tiene página ese día — y la portada
// tampoco la enlaza.
].filter((s) => s.items.length >= 8);
