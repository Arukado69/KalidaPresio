// functions/_lib/token.js
// Token de doble opt-in STATELESS (sin base de datos): un payload {email, exp}
// firmado con HMAC-SHA256 usando SUBSCRIBE_SECRET. Si la firma valida y no
// expiró, el correo está confirmado. (_lib = no es ruta; solo helper.)
//
// Runtime: Cloudflare Workers (Web Crypto API nativa). No requiere deps.

const enc = new TextEncoder();

// ── base64url (sin '+', '/', '=') para que el token viaje seguro en la URL ──
function b64urlFromBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytesFromB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlFromString = (s) => b64urlFromBytes(enc.encode(s));
const stringFromB64url = (s) => new TextDecoder().decode(bytesFromB64url(s));

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/**
 * Crea un token firmado para `email`, válido `ttlMs` (default 24 h).
 * Formato: `<payloadB64url>.<firmaB64url>`.
 */
export async function crearToken(email, secret, ttlMs = 24 * 60 * 60 * 1000) {
  const payload = JSON.stringify({ email: String(email).toLowerCase().trim(), exp: Date.now() + ttlMs });
  const p = b64urlFromString(payload);
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(p)));
  return `${p}.${b64urlFromBytes(sig)}`;
}

/**
 * Verifica firma + expiración. Devuelve { ok, email?, error? }.
 * Comparación de firma en tiempo constante (anti timing-attack).
 */
export async function verificarToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return { ok: false, error: 'token_malformado' };
  const [p, sig] = token.split('.');
  const key = await hmacKey(secret);
  const esperado = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(p)));
  const recibido = bytesFromB64url(sig);
  if (esperado.length !== recibido.length) return { ok: false, error: 'firma_invalida' };
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado[i] ^ recibido[i];
  if (diff !== 0) return { ok: false, error: 'firma_invalida' };
  let payload;
  try { payload = JSON.parse(stringFromB64url(p)); } catch { return { ok: false, error: 'payload_invalido' }; }
  if (!payload.exp || Date.now() > payload.exp) return { ok: false, error: 'expirado' };
  return { ok: true, email: payload.email };
}

/** Validación de email server-side (suficiente, no exhaustiva). */
export function emailValido(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) && email.length <= 254;
}
