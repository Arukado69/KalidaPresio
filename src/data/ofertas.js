/**
 * ofertas — Punto ÚNICO de acceso a lo que el sitio publica.
 *
 * Desde octubre de 2026 la fuente es la VITRINA (src/data/vitrina.json): los
 * productos que tú eliges, cada uno con tu link oficial de afiliado. El feed
 * raspado (ofertas.json) ya no alimenta el sitio: Mercado Libre bloquea a los
 * servidores desde el 8 de octubre y, además, sus links eran armados a mano.
 *
 * Todo lo que importa OFERTAS (portada, colecciones, secciones, 404, panel)
 * recibe el mismo shape canónico de siempre — ver normalizarProducto() en
 * src/utils/vitrina.js — así que los componentes no tuvieron que cambiar.
 *
 * Lo que no se puede publicar (link no oficial, precio viejo, relámpago
 * terminada) se anuncia en el log del build y se ve en /panel/agregar.
 */
import crudo from './vitrina.json';
import { cargarVitrina, revisionMasVieja } from '../utils/vitrina.js';

const { productos, descartes, avisos } = cargarVitrina(crudo);

if (descartes.length) {
  console.warn(`⚠ [vitrina] ${descartes.length} producto(s) fuera de la publicación:`);
  for (const d of descartes) console.warn(`   · #${d.indice + 1} ${d.titulo ?? '(sin título)'} — ${d.motivo}`);
}
for (const a of avisos) console.warn(`⚠ [vitrina] ${a}`);

/** Todo lo publicable, relámpago incluidas (cada página decide qué muestra). */
export const VITRINA = productos;

/** Lo que no se publicó y por qué (para el panel). */
export const DESCARTES = descartes;

/**
 * Lo que va en rejillas y colecciones: todo menos las relámpago. Esas tienen
 * fecha de fin y viven en el carrusel, que las retira en el navegador al
 * vencer; una página estática las seguiría mostrando hasta el próximo build.
 */
export const OFERTAS = productos.filter((p) => !p.oferta_relampago);

/**
 * Cuándo se revisaron estos precios (ISO 8601): la revisión MÁS VIEJA de lo
 * que se muestra, no la más nueva. `null` si no hay nada publicado.
 */
export const GENERADO_EL = revisionMasVieja(OFERTAS);

export default OFERTAS;
