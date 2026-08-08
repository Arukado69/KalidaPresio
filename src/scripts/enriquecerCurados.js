// src/scripts/enriquecerCurados.js
// Rellena título + imagen de los productos curados que solo tienen URL.
//
// USO: pega en src/data/curados.json una entrada mínima:
//   { "url": "https://www.mercadolibre.com.mx/.../p/MLM19309318", "precio": 220 }
// y corre:  npm run enriquecer-curados
//
// Usa la API de CATÁLOGO /products/{id} (responde 200 con auth; NO la de items,
// que da 403). Rellena `titulo` (name) e `imagen` (pictures[0]). El PRECIO no lo
// da esta API → lo pones tú a mano. Best-effort: si falla una entrada, la deja
// como está y sigue. Requiere ML_CLIENT_ID/SECRET/REFRESH_TOKEN en .env.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.resolve(__dirname, '../../.env')); } catch {}

const CURADOS = path.resolve(__dirname, '../data/curados.json');
const CACHE = path.resolve(__dirname, '.ml_token_cache.json');

// ── Token OAuth (reusa la caché de importarMercadoLibre) ────────────────────
async function obtenerToken() {
  if (existsSync(CACHE)) {
    try {
      const c = JSON.parse(readFileSync(CACHE, 'utf-8'));
      if (c.access_token && Date.now() < c.expires_at) return c.access_token;
    } catch {}
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ML_CLIENT_ID,
    client_secret: process.env.ML_CLIENT_SECRET,
    refresh_token: process.env.ML_REFRESH_TOKEN,
  });
  const r = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
  });
  if (!r.ok) throw new Error(`OAuth ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  try {
    writeFileSync(CACHE, JSON.stringify({
      access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: Date.now() + (j.expires_in ?? 21600) * 1000 - 300000,
    }, null, 2));
  } catch {}
  return j.access_token;
}

// De una URL de catálogo (.../p/MLM19309318) saca el ID de producto.
const idCatalogo = (url) => (String(url).match(/\/p\/(MLM\d+)/) || [])[1] || null;
const aHD = (u) => (u ? u.replace(/(-[A-Z])\.(jpg|jpeg|webp)$/i, '-O.webp') : u);

async function main() {
  const curados = JSON.parse(readFileSync(CURADOS, 'utf-8'));
  const pendientes = curados.filter((c) => (!c.titulo || !c.imagen) && idCatalogo(c.url));
  if (pendientes.length === 0) {
    console.log('✅ Nada que enriquecer (todos tienen título e imagen, o son URLs de listado).');
    return;
  }
  const token = await obtenerToken();
  let ok = 0;
  for (const c of curados) {
    const id = idCatalogo(c.url);
    if (!id || (c.titulo && c.imagen)) continue;
    try {
      const r = await fetch(`https://api.mercadolibre.com/products/${id}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (!r.ok) { console.warn(`  ⚠ ${id}: HTTP ${r.status} — se deja como está`); continue; }
      const p = await r.json();
      if (!c.titulo && p.name) c.titulo = p.name;
      if (!c.imagen && p.pictures?.[0]?.url) c.imagen = aHD(p.pictures[0].url);
      ok++;
      console.log(`  ✓ ${id}: "${(c.titulo || '').slice(0, 45)}"`);
      await new Promise((res) => setTimeout(res, 300)); // educado con ML
    } catch (e) {
      console.warn(`  ⚠ ${id}: ${e.message}`);
    }
  }
  writeFileSync(CURADOS, JSON.stringify(curados, null, 2) + '\n', 'utf-8');
  console.log(`\n💾 curados.json actualizado (${ok} enriquecidos). Falta poner el PRECIO a mano donde no lo tengas.`);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
