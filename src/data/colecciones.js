/**
 * colecciones — Definiciones de Clústeres de Intención para SEO.
 *
 * Cada clúster agrupa productos de ofertas.json según una lógica de filtrado
 * editorial + algorítmica. Las páginas resultantes (/colecciones/[slug])
 * son generadas estáticamente por Astro en build-time.
 *
 * VENTAJAS SEO:
 * - Long-tail keywords en la URL, H1 y meta description.
 * - Contenido único por página (distintos filtros = distintos productos).
 * - Internal linking desde index → colección → producto.
 * - Estructura de hub (index de colecciones) que Google rastrea fácilmente.
 *
 * CÓMO AGREGAR UN CLÚSTER:
 * Añade un objeto al array COLECCIONES con: slug, titulo, descripcion,
 * emoji, filtro (función), y orden (función de sort).
 */
import { categorizar } from '../utils/categorias.js';
import ofertas from './ofertas.json';

// ── Scoring (idéntico al de index.astro — Single Source of Truth) ────────────
function scoreDe(o) {
  if (typeof o.score_kalidad_presio === 'number') return o.score_kalidad_presio;
  const r = ((o.rating ?? 0) / 5) * 65;
  const d = (Math.min(o.descuento ?? 0, 40) / 40) * 20;
  const op = Math.min(((o.opiniones ?? 0) / 500) * 15, 15);
  return Math.round(r + d + op);
}

// Pre-calcular score y categoría para todos los productos (una sola vez)
const ofertasEnriquecidas = ofertas.map(o => ({
  ...o,
  score100: scoreDe(o),
  categoria_inferida: categorizar(o.titulo ?? ''),
}));

// ═══════════════════════════════════════════════════════════════════════
// DEFINICIÓN DE CLÚSTERES
// Cada uno filtra y ordena el catálogo de forma independiente.
// Los items ya vienen con score100 y categoria_inferida precalculados.
// ═══════════════════════════════════════════════════════════════════════

export const COLECCIONES = [
  {
    slug: 'mejores-ofertas-tecnologia',
    titulo: 'Las Mejores Ofertas en Tecnología',
    descripcion: 'Selección curada de las mejores ofertas en tecnología de Mercado Libre México, ordenadas por nuestro algoritmo KalidaPresio que evalúa calidad, descuento y satisfacción real de compradores.',
    emoji: '💻',
    color: 'var(--color-primary)',
    items: ofertasEnriquecidas
      .filter(o => o.categoria_inferida === 'Tecnología')
      .sort((a, b) => b.score100 - a.score100),
  },

  {
    slug: 'mas-vendidos-del-mes',
    titulo: 'Los Más Vendidos del Mes',
    descripcion: 'Los productos más populares según miles de reseñas verificadas de compradores en Mercado Libre México. Volumen de ventas real, no posicionamiento pagado.',
    emoji: '🏆',
    color: 'var(--color-warm)',
    items: ofertasEnriquecidas
      .filter(o => o.mas_vendido === true || (o.opiniones ?? 0) > 1000)
      .sort((a, b) => (b.opiniones ?? 0) - (a.opiniones ?? 0)),
  },

  {
    slug: 'ofertas-relampago-hoy',
    titulo: 'Ofertas con Descuento Máximo',
    descripcion: 'Las ofertas con mayor porcentaje de descuento disponibles ahora mismo en Mercado Libre México. Precios verificados por KalidaPresio — ¡aprovéchalos antes de que suban!',
    emoji: '⚡',
    color: 'var(--color-accent)',
    items: ofertasEnriquecidas
      .filter(o => (o.descuento ?? 0) >= 35)
      .sort((a, b) => (b.descuento ?? 0) - (a.descuento ?? 0)),
  },
];

/**
 * Devuelve solo las colecciones que tienen al menos 2 productos.
 * Evita generar páginas vacías o con un solo item (malo para SEO).
 */
export const COLECCIONES_ACTIVAS = COLECCIONES.filter(c => c.items.length >= 2);
