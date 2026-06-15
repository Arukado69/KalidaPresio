/**
 * secciones — Colecciones de datos POR SECCIÓN para el sitio (build-time).
 *
 * Fuente: src/data/secciones-prueba.json (lo escribe extraer-secciones.mjs;
 * el hook de astro.config lo refresca al inicio de cada build).
 *
 * EDGE CASE crítico: si el JSON no existe o está corrupto, NUNCA tronamos el
 * build — degradamos a ofertas.json (el feed de producción de n8n):
 *   · relampago ← items con oferta_relampago (su relampago_fin → fin_oferta)
 *   · imbatibles ← el resto del catálogo (para que el grid no quede vacío)
 *
 * Este módulo corre SOLO en Node durante el build (lo importan los
 * frontmatter de .astro). Nada de esto llega al navegador como JS.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ofertasProduccion from './ofertas.json';
import { calcularScorePorSeccion } from '../utils/scoreSecciones.js';

function cargarSecciones() {
  // OJO: en `astro build` este módulo corre EMPAQUETADO (import.meta.url
  // apunta a dist/chunks/, no a src/data/). Por eso la ruta primaria se
  // resuelve desde la raíz del proyecto (cwd del build); la URL relativa
  // queda como respaldo para contextos donde el módulo no se reubica.
  const candidatos = [
    path.resolve(process.cwd(), 'src/data/secciones-prueba.json'),
    new URL('./secciones-prueba.json', import.meta.url),
  ];
  for (const ruta of candidatos) {
    try {
      const datos = JSON.parse(readFileSync(ruta, 'utf-8'));
      if (Array.isArray(datos) && datos.length > 0) return datos;
    } catch { /* siguiente candidato */ }
  }
  return null; // sin archivo / corrupto → fallback a ofertas.json
}

const seccionado = cargarSecciones();

/** true si estamos sirviendo el fallback de ofertas.json (sin extractor). */
export const ES_FALLBACK = seccionado === null;

// ── Normalización: ambas fuentes acaban con el MISMO shape ──────────────────
// (fin_oferta es el nombre canónico nuevo; relampago_fin se mantiene como
// espejo para que TarjetaOferta y los countdowns existentes sigan funcionando)
const normalizar = (it) => ({
  ...it,
  fin_oferta: it.fin_oferta ?? it.relampago_fin ?? null,
  relampago_fin: it.relampago_fin ?? it.fin_oferta ?? null,
  secciones: it.secciones ?? (it.oferta_relampago ? ['relampago'] : ['imbatibles']),
});

const base = (seccionado ?? ofertasProduccion).map(normalizar);
const ahora = Date.now();

/**
 * RELÁMPAGO — pesos estándar (el score global del JSON ya los usa).
 * Pre-filtro de build: lo ya vencido ni se renderiza; lo que venza después
 * del build lo retira el cliente (initRelampago en Layout).
 */
export const ALL_RELAMPAGO = base
  .filter((it) => it.secciones.includes('relampago'))
  .filter((it) => !it.fin_oferta || new Date(it.fin_oferta).getTime() > ahora)
  .sort((a, b) => (b.score_kalidad_presio ?? 0) - (a.score_kalidad_presio ?? 0));

/**
 * IMBATIBLES — score RECALIBRADO (65/10/25: el volumen compensa la falta de
 * descuento). Un solo campo persistido (score_kalidad_presio global); el
 * seccional vive solo aquí como `score_seccion` y ordena/se muestra en el grid.
 */
export const ALL_IMBATIBLES = base
  .filter((it) => it.secciones.includes('imbatibles'))
  .map((it) => ({ ...it, score_seccion: calcularScorePorSeccion(it, 'imbatibles') }))
  .sort((a, b) => b.score_seccion - a.score_seccion);

// Backlog (datos listos, render en el siguiente sprint): liquidacion, menos-500.
export const ALL_LIQUIDACION = base.filter((it) => it.secciones.includes('liquidacion'));
export const ALL_MENOS_500 = base.filter((it) => it.secciones.includes('menos-500'));
