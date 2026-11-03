/**
 * generarPrecios.js — public/data/precios.json, lo que lee el backend para las
 * alertas «avísame cuando baje».
 *
 * El backend corre en otro contenedor y no ve la vitrina: cada media hora lee
 * este archivo del sitio y, si un producto está a un precio vigente igual o
 * menor al que alguien pidió, le escribe una sola vez con el link oficial.
 * Qué entra y por qué: src/utils/alertas.js.
 *
 * NO se versiona: es un derivado de la vitrina, como feed.json.
 *
 * Ejecutar:  node src/scripts/generarPrecios.js   (automático en `npm run build`)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogoAlertas, ESQUEMA_PRECIOS } from '../utils/alertas.js';
import { RUTA_VITRINA } from './vitrinaDisco.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SALIDA_DIR = path.resolve(__dirname, '../../public/data');
const SALIDA = path.resolve(SALIDA_DIR, 'precios.json');

const crudo = JSON.parse(readFileSync(RUTA_VITRINA, 'utf-8'));
const productos = catalogoAlertas(crudo);
const vigentes = productos.filter((p) => Date.parse(p.vigente_hasta) > Date.now()).length;

if (!existsSync(SALIDA_DIR)) mkdirSync(SALIDA_DIR, { recursive: true });
writeFileSync(SALIDA, JSON.stringify({
  esquema: ESQUEMA_PRECIOS,
  generadoEl: new Date().toISOString(),
  total: productos.length,
  productos,
}) + '\n', 'utf-8');

console.log(`✅ [precios] ${productos.length} productos en public/data/precios.json (${vigentes} con precio vigente para disparar alertas).`);
