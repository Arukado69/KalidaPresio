// backend/token.js
// Token firmado STATELESS para el doble opt-in y la baja del boletín: un
// payload {email, uso, exp} firmado con HMAC-SHA256 usando SUBSCRIBE_SECRET.
// Si la firma valida y no expiró, la intención está probada — sin guardar nada
// intermedio en la base.
//
// Port del original de functions/_lib/token.js (Web Crypto) a node:crypto,
// para que el backend que SÍ se despliega tenga el mismo doble opt-in que
// estaba escrito y muerto en functions/.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

// ── base64url (sin '+', '/', '=') para que el token viaje seguro en la URL ──
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const deB64url = (str) => Buffer.from(str, 'base64url');

const firmar = (secreto, datos) =>
  createHmac('sha256', secreto).update(datos).digest();

/**
 * Crea un token firmado para `email`.
 * @param {string} email
 * @param {string} secreto  SUBSCRIBE_SECRET
 * @param {'alta'|'baja'} uso  para qué sirve (un token de baja no confirma altas)
 * @param {number} ttlMs  vigencia; las bajas viven mucho más (van en cada correo)
 * @returns {string} `<payloadB64url>.<firmaB64url>`
 */
export function crearToken(email, secreto, uso = 'alta', ttlMs = 24 * 60 * 60 * 1000) {
  const payload = JSON.stringify({
    email: String(email).toLowerCase().trim(),
    uso,
    exp: Date.now() + ttlMs,
  });
  const p = b64url(payload);
  return `${p}.${b64url(firmar(secreto, p))}`;
}

/**
 * Verifica firma, uso y expiración. Nunca lanza.
 * @returns {{ok: true, email: string} | {ok: false, error: string}}
 */
export function verificarToken(token, secreto, usoEsperado = 'alta') {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, error: 'token_malformado' };
  }
  const [p, sig] = token.split('.');

  const esperado = firmar(secreto, p);
  let recibido;
  try {
    recibido = deB64url(sig);
  } catch {
    return { ok: false, error: 'firma_invalida' };
  }
  // timingSafeEqual exige longitudes iguales; comprobarlo antes NO filtra nada
  // (la longitud de un HMAC-SHA256 es pública y siempre 32 bytes).
  if (esperado.length !== recibido.length) return { ok: false, error: 'firma_invalida' };
  if (!timingSafeEqual(esperado, recibido)) return { ok: false, error: 'firma_invalida' };

  let payload;
  try {
    payload = JSON.parse(deB64url(p).toString('utf-8'));
  } catch {
    return { ok: false, error: 'payload_invalido' };
  }

  if (payload.uso !== usoEsperado) return { ok: false, error: 'uso_incorrecto' };
  if (!payload.exp || Date.now() > payload.exp) return { ok: false, error: 'expirado' };

  return { ok: true, email: payload.email };
}

/** Comparación de secretos en tiempo constante, tolerante a longitudes distintas. */
export function secretoIgual(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf-8');
  const bufB = Buffer.from(String(b ?? ''), 'utf-8');
  // Se comparan los HMAC y no los valores crudos: así timingSafeEqual siempre
  // recibe 32 bytes y la diferencia de longitud tampoco se filtra por el tiempo.
  const sal = randomBytes(16);
  return timingSafeEqual(
    createHmac('sha256', sal).update(bufA).digest(),
    createHmac('sha256', sal).update(bufB).digest(),
  );
}

/** Validación de email server-side (suficiente, no exhaustiva). */
export function emailValido(email) {
  return (
    typeof email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) &&
    email.length <= 254
  );
}
