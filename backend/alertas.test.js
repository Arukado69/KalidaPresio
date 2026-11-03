/**
 * Tests de las alertas «avísame cuando baje» (backend/alertas.js).
 *
 * Lo que se protege:
 *  · que una alerta SOLO se dispare con un precio vigente igual o menor al
 *    objetivo (nunca con un precio viejo, aunque sea más bajo);
 *  · que se dispare UNA sola vez, aunque dos revisiones se encimen;
 *  · que un envío fallido no la pierda (vuelve a intentarse, con tope);
 *  · que cancelar, vencer y purgar hagan lo que dice el aviso de privacidad;
 *  · que los tokens no se puedan usar para otra cosa ni alterar.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  crearRepoAlertas,
  crearRevisor,
  leerCatalogo,
  normalizarIdProducto,
  normalizarObjetivo,
  porDisparar,
  validarAlta,
  esVigente,
  MAX_INTENTOS,
} from './alertas.js';
import { crearToken, verificarToken } from './token.js';

const AHORA = Date.parse('2026-11-03T18:00:00Z');
const HORA = 3_600_000;

const producto = (extra = {}) => ({
  id: 'MLM44113911',
  slug: 'samsung-galaxy-a16-mlm44113911',
  titulo: 'Samsung Galaxy A16 128 GB',
  imagen: null,
  precio: 2389,
  visto: new Date(AHORA - 2 * HORA).toISOString(),
  vigente_hasta: new Date(AHORA + 5 * 24 * HORA).toISOString(),
  relampago: false,
  termina: null,
  enlace: 'https://meli.la/1AbCdE',
  ...extra,
});

describe('validación de lo que llega del formulario', () => {
  it('acepta ids de Mercado Libre y los del sitio (kp-…), nada más', () => {
    expect(normalizarIdProducto(' MLM44113911 ')).toBe('MLM44113911');
    expect(normalizarIdProducto('kp-1AbCdE')).toBe('kp-1AbCdE');
    expect(normalizarIdProducto('MLM12')).toBeNull();
    expect(normalizarIdProducto('<script>')).toBeNull();
    expect(normalizarIdProducto(42)).toBeNull();
  });

  it('lee el precio como lo escribe la gente', () => {
    expect(normalizarObjetivo('$1,349')).toBe(1349);
    expect(normalizarObjetivo('1349.505')).toBe(1349.51);
    expect(normalizarObjetivo(999)).toBe(999);
    expect(normalizarObjetivo('0')).toBeNull();
    expect(normalizarObjetivo('gratis')).toBeNull();
    expect(normalizarObjetivo(1e9)).toBeNull();
  });

  it('la alerta tiene que pedir un precio MÁS BAJO que el último que vimos', () => {
    expect(validarAlta(producto(), 2000)).toEqual({ ok: true });
    expect(validarAlta(producto(), 2389)).toEqual({ ok: false, error: 'precio_alcanzado', precio: 2389 });
    expect(validarAlta(producto(), 2500)).toMatchObject({ ok: false });
  });

  it('el catálogo con otro esquema se rechaza en vez de interpretarse a medias', () => {
    expect(() => leerCatalogo({ esquema: 2, productos: [] })).toThrow();
    expect(() => leerCatalogo(null)).toThrow();
    expect(leerCatalogo({ esquema: 1, productos: [producto(), { id: 'x' }] })).toHaveLength(1);
  });
});

describe('porDisparar — solo con un precio vigente', () => {
  const alerta = (extra = {}) => ({ id: 1, email: 'a@b.mx', producto_id: 'MLM44113911', objetivo: 2000, ...extra });

  it('se cumple cuando el precio vigente es igual o menor al objetivo', () => {
    expect(porDisparar([alerta()], [producto({ precio: 1999 })], AHORA)).toHaveLength(1);
    expect(porDisparar([alerta()], [producto({ precio: 2000 })], AHORA)).toHaveLength(1);
    expect(porDisparar([alerta()], [producto({ precio: 2001 })], AHORA)).toHaveLength(0);
  });

  it('NO se cumple con un precio vencido, aunque sea más bajo', () => {
    const viejo = producto({ precio: 1500, vigente_hasta: new Date(AHORA - HORA).toISOString() });
    expect(esVigente(viejo, AHORA)).toBe(false);
    expect(porDisparar([alerta()], [viejo], AHORA)).toHaveLength(0);
  });

  it('una relámpago que ya terminó no cuenta', () => {
    const terminada = producto({ precio: 1500, relampago: true, vigente_hasta: new Date(AHORA - 1).toISOString() });
    expect(porDisparar([alerta()], [terminada], AHORA)).toHaveLength(0);
  });

  it('un producto que ya no está en el catálogo no dispara nada', () => {
    expect(porDisparar([alerta({ producto_id: 'MLM99999999' })], [producto({ precio: 10 })], AHORA)).toHaveLength(0);
  });
});

describe('la base de las alertas', () => {
  let db;
  let repo;
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    repo = crearRepoAlertas(db);
  });

  const guardar = (extra = {}) => repo.guardar({ email: 'a@b.mx', productoId: 'MLM44113911', objetivo: 2000, titulo: 'Galaxy', slug: 'galaxy-mlm44113911', precio: 2389, ip: '1.2.3.4', ...extra });

  it('una alerta por producto y correo: pedirla otra vez cambia el precio y la reactiva', () => {
    guardar();
    const [primera] = repo.activas();
    expect(repo.reclamar(primera.id, 1999)).toBe(true);
    expect(repo.activas()).toHaveLength(0);

    guardar({ objetivo: 1800 });
    const activas = repo.activas();
    expect(activas).toHaveLength(1);
    expect(activas[0]).toMatchObject({ id: primera.id, objetivo: 1800 });
  });

  it('cuenta las OTRAS alertas activas del correo (para el tope)', () => {
    guardar();
    guardar({ productoId: 'MLM10000001' });
    expect(repo.contarOtrasActivas('a@b.mx', 'MLM44113911')).toBe(1);
    expect(repo.contarOtrasActivas('a@b.mx', 'MLM20000000')).toBe(2);
    expect(repo.contarOtrasActivas('otra@b.mx', 'MLM44113911')).toBe(0);
  });

  it('reclamar es de una sola vez: dos revisiones encimadas no mandan dos correos', () => {
    guardar();
    const [a] = repo.activas();
    expect(repo.reclamar(a.id, 1999)).toBe(true);
    expect(repo.reclamar(a.id, 1999)).toBe(false);
  });

  it('un envío fallido la regresa a activa, y tras varios intentos se rinde', () => {
    guardar();
    const [a] = repo.activas();
    for (let i = 1; i < MAX_INTENTOS; i++) {
      expect(repo.reclamar(a.id, 1999)).toBe(true);
      repo.liberar(a.id);
      expect(repo.activas()).toHaveLength(1);
    }
    expect(repo.reclamar(a.id, 1999)).toBe(true);
    repo.liberar(a.id);
    expect(repo.activas()).toHaveLength(0);
    expect(db.prepare('SELECT estado FROM alertas WHERE id = ?').get(a.id).estado).toBe('error');
  });

  it('cancelar solo toca la alerta activa de ese correo y producto', () => {
    guardar();
    guardar({ email: 'otra@b.mx' });
    expect(repo.cancelar('a@b.mx', 'MLM44113911')).toBe(true);
    expect(repo.cancelar('a@b.mx', 'MLM44113911')).toBe(false);
    expect(repo.activas().map((x) => x.email)).toEqual(['otra@b.mx']);
  });

  it('vencen a los 180 días y las cerradas se borran a los 90', () => {
    guardar();
    guardar({ productoId: 'MLM10000001' });
    db.exec(`UPDATE alertas SET creada = datetime('now', '-181 days') WHERE producto_id = 'MLM44113911'`);
    expect(repo.vencer()).toBe(1);
    expect(repo.activas().map((x) => x.producto_id)).toEqual(['MLM10000001']);

    expect(repo.purgar()).toBe(0); // recién cerrada: se queda un tiempo
    db.exec(`UPDATE alertas SET cerrada_en = datetime('now', '-91 days') WHERE estado = 'vencida'`);
    expect(repo.purgar()).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM alertas').get().n).toBe(1);
  });

  it('el resumen cuenta personas por producto, sin correos', () => {
    guardar({ objetivo: 2000 });
    guardar({ email: 'otra@b.mx', objetivo: 1800 });
    const [r] = repo.resumen();
    expect(r).toMatchObject({ producto_id: 'MLM44113911', personas: 2, objetivo_mas_alto: 2000, objetivo_mas_bajo: 1800 });
    expect(JSON.stringify(repo.resumen())).not.toContain('@');
  });
});

describe('el revisor', () => {
  let repo;
  const silencioso = { log: () => {}, error: () => {} };
  beforeEach(() => {
    repo = crearRepoAlertas(new DatabaseSync(':memory:'));
    repo.guardar({ email: 'a@b.mx', productoId: 'MLM44113911', objetivo: 2000 });
  });

  it('manda el aviso cuando se cumple, y no lo repite en la siguiente vuelta', async () => {
    const enviados = [];
    const revisar = crearRevisor({
      repo,
      obtenerCatalogo: async () => [producto({ precio: 1899 })],
      avisar: async (alerta, p) => { enviados.push([alerta.email, p.precio]); },
      log: silencioso,
      reloj: () => AHORA,
    });
    expect(await revisar()).toMatchObject({ activas: 1, cumplidas: 1, enviadas: 1 });
    expect(await revisar()).toMatchObject({ activas: 0, enviadas: 0 });
    expect(enviados).toEqual([['a@b.mx', 1899]]);
  });

  it('si el correo falla, la alerta sigue activa para la próxima vuelta', async () => {
    const revisar = crearRevisor({
      repo,
      obtenerCatalogo: async () => [producto({ precio: 1899 })],
      avisar: async () => { throw new Error('ESP caído'); },
      log: silencioso,
      reloj: () => AHORA,
    });
    expect(await revisar()).toMatchObject({ fallidas: 1 });
    expect(repo.activas()).toHaveLength(1);
  });

  it('sin catálogo no hace nada ni lanza', async () => {
    const revisar = crearRevisor({
      repo,
      obtenerCatalogo: async () => { throw new Error('sin red'); },
      avisar: async () => { throw new Error('no debería llamarse'); },
      log: silencioso,
      reloj: () => AHORA,
    });
    expect(await revisar()).toMatchObject({ error: 'catalogo' });
    expect(repo.activas()).toHaveLength(1);
  });

  it('dos revisiones a la vez: la segunda se omite', async () => {
    let soltar;
    const revisar = crearRevisor({
      repo,
      obtenerCatalogo: () => new Promise((r) => { soltar = () => r([producto({ precio: 1899 })]); }),
      avisar: async () => {},
      log: silencioso,
      reloj: () => AHORA,
    });
    const primera = revisar();
    expect(await revisar()).toEqual({ omitida: true });
    soltar();
    expect(await primera).toMatchObject({ enviadas: 1 });
  });
});

describe('tokens de las alertas', () => {
  const SECRETO = 'secreto-de-prueba';

  it('llevan el producto y el precio firmados', () => {
    const t = crearToken('A@B.mx ', SECRETO, 'alerta', HORA, { p: 'MLM44113911', o: 2000 });
    const r = verificarToken(t, SECRETO, 'alerta');
    expect(r).toMatchObject({ ok: true, email: 'a@b.mx' });
    expect(r.datos).toMatchObject({ p: 'MLM44113911', o: 2000 });
  });

  it('los datos no pueden pisar el correo ni el uso', () => {
    const t = crearToken('a@b.mx', SECRETO, 'alerta', HORA, { email: 'otro@x.mx', uso: 'baja' });
    expect(verificarToken(t, SECRETO, 'alerta')).toMatchObject({ ok: true, email: 'a@b.mx' });
  });

  it('un token de alerta no sirve para otra cosa', () => {
    const t = crearToken('a@b.mx', SECRETO, 'alerta', HORA, { p: 'MLM44113911', o: 2000 });
    expect(verificarToken(t, SECRETO, 'alerta-baja')).toMatchObject({ ok: false, error: 'uso_incorrecto' });
    expect(verificarToken(t, SECRETO, 'alta')).toMatchObject({ ok: false });
  });

  it('cambiar el precio dentro del token rompe la firma', () => {
    const t = crearToken('a@b.mx', SECRETO, 'alerta', HORA, { p: 'MLM44113911', o: 2000 });
    const [p, firma] = t.split('.');
    const datos = JSON.parse(Buffer.from(p, 'base64url').toString());
    datos.o = 1;
    const alterado = `${Buffer.from(JSON.stringify(datos)).toString('base64url')}.${firma}`;
    expect(verificarToken(alterado, SECRETO, 'alerta')).toMatchObject({ ok: false, error: 'firma_invalida' });
  });
});
