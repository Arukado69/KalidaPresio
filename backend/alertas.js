// backend/alertas.js — «Avísame cuando baje».
//
// La persona elige un producto y un precio; cuando lo vemos a ese precio o
// menos, le escribimos UNA vez con el link oficial. Es el clic con más
// intención de compra que puede tener el sitio, así que tiene que ser honesto:
//
//  · Solo se dispara con un precio VIGENTE del catálogo del sitio
//    (/data/precios.json, ver src/utils/alertas.js): visto en los últimos 7
//    días, o una relámpago que no ha terminado. Nunca con un dato viejo.
//  · Doble opt-in, como el boletín: POST /api/alertas NO guarda nada, firma
//    un token con {email, producto, objetivo} y manda el correo. La alerta
//    existe solo cuando la persona confirma.
//  · Una sola vez: al dispararse queda «disparada». Para otra, se crea otra.
//  · Caduca a los 180 días y los registros cerrados se borran a los 90.
//
// Este módulo NO abre la base ni la red: el server le pasa la base, la forma
// de leer el catálogo y la de enviar correos. Así se prueba con una SQLite en
// memoria (backend/alertas.test.js).

/** Alertas activas por correo, como máximo. Evita que una sola cuenta llene la base. */
export const MAX_ACTIVAS_POR_CORREO = 20;
/** Días que vive una alerta sin dispararse. */
export const DIAS_VIDA = 180;
/** Días que se guarda una alerta ya cerrada (disparada, cancelada, vencida). */
export const DIAS_PURGA = 90;
/** Envíos fallidos antes de rendirse con una alerta. */
export const MAX_INTENTOS = 5;

// ── Esquema ───────────────────────────────────────────────────────────────────
// UNIQUE(email, producto_id): una alerta por producto y correo. Volver a
// pedirla (con otro precio, o después de que se disparó) la reactiva.
// Sin user-agent ni rastreo: la IP es la de la confirmación, como evidencia de
// consentimiento (igual que en el boletín), y se borra con la fila.
export const ESQUEMA_ALERTAS = `
  CREATE TABLE IF NOT EXISTS alertas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    producto_id TEXT NOT NULL,
    objetivo REAL NOT NULL,
    titulo TEXT,
    slug TEXT,
    precio_al_crear REAL,
    estado TEXT NOT NULL DEFAULT 'activa',
    creada DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip TEXT,
    cerrada_en DATETIME,
    precio_disparo REAL,
    intentos INTEGER NOT NULL DEFAULT 0,
    UNIQUE(email, producto_id)
  );
  CREATE INDEX IF NOT EXISTS idx_alertas_estado ON alertas(estado, producto_id);
`;

// ── Validación (pura) ─────────────────────────────────────────────────────────

/** «MLM44113911» o «kp-<código del link>»; null si no parece un id del sitio. */
export function normalizarIdProducto(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^(ML[A-Z]\d{6,}|kp-[A-Za-z0-9_-]{1,40})$/.test(s) ? s : null;
}

/** «$1,349», «1349.50», 1349 → 1349.5. null si no es un precio razonable. */
export function normalizarObjetivo(v) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n < 1 || n > 10_000_000) return null;
  return Math.round(n * 100) / 100;
}

/** ¿Este precio del catálogo cuenta como «de hoy»? */
export function esVigente(producto, ahora = Date.now()) {
  const hasta = Date.parse(producto?.vigente_hasta ?? '');
  return Number.isFinite(hasta) && hasta > ahora;
}

/** Lee y valida /data/precios.json. Lanza si el formato no es el esperado. */
export function leerCatalogo(json) {
  if (!json || json.esquema !== 1 || !Array.isArray(json.productos)) {
    throw new Error('precios.json con un formato que no entiendo (se esperaba esquema 1)');
  }
  return json.productos.filter((p) => p && typeof p.id === 'string' && p.precio > 0 && typeof p.enlace === 'string');
}

/**
 * ¿Se puede pedir esta alerta? Siempre por DEBAJO del último precio que vimos:
 * pedir «avísame cuando baje de $1,500» de algo que ya está en $1,200 no es
 * una alerta, es un correo inmediato.
 *
 * @returns {{ok: true} | {ok: false, error: 'precio_alcanzado', precio: number}}
 */
export function validarAlta(producto, objetivo) {
  if (objetivo >= producto.precio) return { ok: false, error: 'precio_alcanzado', precio: producto.precio };
  return { ok: true };
}

/**
 * Las alertas activas que ya se cumplieron: su producto tiene un precio
 * vigente igual o menor al objetivo.
 *
 * @param {{id: number, producto_id: string, objetivo: number}[]} activas
 * @param {ReturnType<typeof leerCatalogo>} catalogo
 * @param {number} [ahora]
 */
export function porDisparar(activas, catalogo, ahora = Date.now()) {
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const listas = [];
  for (const alerta of activas) {
    const producto = porId.get(alerta.producto_id);
    if (!producto || !esVigente(producto, ahora)) continue;
    if (producto.precio <= alerta.objetivo) listas.push({ alerta, producto });
  }
  return listas;
}

// ── Base de datos ─────────────────────────────────────────────────────────────

/**
 * Las consultas de las alertas sobre una base node:sqlite ya abierta.
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function crearRepoAlertas(db) {
  db.exec(ESQUEMA_ALERTAS);

  const stmtContarActivas = db.prepare(
    `SELECT COUNT(*) AS n FROM alertas WHERE email = ? AND estado = 'activa' AND producto_id != ?`,
  );
  const stmtGuardar = db.prepare(`
    INSERT INTO alertas (email, producto_id, objetivo, titulo, slug, precio_al_crear, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email, producto_id) DO UPDATE SET
      objetivo = excluded.objetivo,
      titulo = COALESCE(excluded.titulo, alertas.titulo),
      slug = COALESCE(excluded.slug, alertas.slug),
      precio_al_crear = excluded.precio_al_crear,
      ip = excluded.ip,
      estado = 'activa',
      creada = CURRENT_TIMESTAMP,
      cerrada_en = NULL,
      precio_disparo = NULL,
      intentos = 0
  `);
  const stmtActivas = db.prepare(`SELECT id, email, producto_id, objetivo, titulo, slug FROM alertas WHERE estado = 'activa'`);
  const stmtReclamar = db.prepare(`
    UPDATE alertas SET estado = 'disparada', cerrada_en = CURRENT_TIMESTAMP, precio_disparo = ?
    WHERE id = ? AND estado = 'activa'
  `);
  const stmtLiberar = db.prepare(`
    UPDATE alertas SET
      intentos = intentos + 1,
      estado = CASE WHEN intentos + 1 >= ? THEN 'error' ELSE 'activa' END,
      cerrada_en = CASE WHEN intentos + 1 >= ? THEN CURRENT_TIMESTAMP ELSE NULL END,
      precio_disparo = NULL
    WHERE id = ? AND estado = 'disparada'
  `);
  const stmtCancelar = db.prepare(`
    UPDATE alertas SET estado = 'cancelada', cerrada_en = CURRENT_TIMESTAMP
    WHERE email = ? AND producto_id = ? AND estado = 'activa'
  `);
  const stmtVencer = db.prepare(`
    UPDATE alertas SET estado = 'vencida', cerrada_en = CURRENT_TIMESTAMP
    WHERE estado = 'activa' AND creada < datetime('now', ?)
  `);
  const stmtPurgar = db.prepare(`
    DELETE FROM alertas WHERE estado != 'activa' AND cerrada_en < datetime('now', ?)
  `);
  const stmtResumen = db.prepare(`
    SELECT producto_id, MAX(titulo) AS titulo, COUNT(*) AS personas,
           MAX(objetivo) AS objetivo_mas_alto, MIN(objetivo) AS objetivo_mas_bajo
    FROM alertas WHERE estado = 'activa'
    GROUP BY producto_id ORDER BY personas DESC, objetivo_mas_alto DESC
  `);

  return {
    /** Alertas activas de un correo, sin contar la de este producto (que se reemplaza). */
    contarOtrasActivas: (email, productoId) => stmtContarActivas.get(email, productoId).n,
    /** Crea o reactiva la alerta de (email, producto). */
    guardar: ({ email, productoId, objetivo, titulo = null, slug = null, precio = null, ip = null }) =>
      stmtGuardar.run(email, productoId, objetivo, titulo, slug, precio, ip),
    activas: () => stmtActivas.all(),
    /** Marca la alerta como disparada ANTES de enviar: dos revisiones no mandan dos correos. */
    reclamar: (id, precio) => stmtReclamar.run(precio, id).changes === 1,
    /** El envío falló: vuelve a activa (o a «error» tras MAX_INTENTOS). */
    liberar: (id) => stmtLiberar.run(MAX_INTENTOS, MAX_INTENTOS, id).changes === 1,
    cancelar: (email, productoId) => stmtCancelar.run(email, productoId).changes === 1,
    vencer: (dias = DIAS_VIDA) => stmtVencer.run(`-${dias} days`).changes,
    purgar: (dias = DIAS_PURGA) => stmtPurgar.run(`-${dias} days`).changes,
    /** Cuántas personas esperan cada producto y a qué precio (sin correos). */
    resumen: () => stmtResumen.all(),
  };
}

// ── El revisor ────────────────────────────────────────────────────────────────

/**
 * Crea la función que revisa las alertas contra el catálogo y manda los
 * «¡Bajó!». Nunca lanza: devuelve un resumen y registra los problemas.
 *
 * @param {{
 *   repo: ReturnType<typeof crearRepoAlertas>,
 *   obtenerCatalogo: () => Promise<ReturnType<typeof leerCatalogo>>,
 *   avisar: (alerta: object, producto: object) => Promise<void>,
 *   log?: Pick<Console, 'log' | 'error'>,
 *   reloj?: () => number,
 * }} deps
 */
export function crearRevisor({ repo, obtenerCatalogo, avisar, log = console, reloj = Date.now }) {
  let enCurso = false;

  return async function revisarAlertas() {
    if (enCurso) return { omitida: true };
    enCurso = true;
    const resumen = { activas: 0, cumplidas: 0, enviadas: 0, fallidas: 0, vencidas: 0, purgadas: 0 };
    try {
      resumen.vencidas = repo.vencer();
      resumen.purgadas = repo.purgar();

      let catalogo;
      try {
        catalogo = await obtenerCatalogo();
      } catch (e) {
        log.error(`[Alertas] No pude leer el catálogo de precios: ${e.message}`);
        return { ...resumen, error: 'catalogo' };
      }

      const activas = repo.activas();
      resumen.activas = activas.length;
      const listas = porDisparar(activas, catalogo, reloj());
      resumen.cumplidas = listas.length;

      for (const { alerta, producto } of listas) {
        if (!repo.reclamar(alerta.id, producto.precio)) continue;
        try {
          await avisar(alerta, producto);
          resumen.enviadas++;
          log.log(`[Alertas] «¡Bajó!» enviado: alerta ${alerta.id}, ${producto.id} a $${producto.precio} (pedía $${alerta.objetivo}).`);
        } catch (e) {
          repo.liberar(alerta.id);
          resumen.fallidas++;
          log.error(`[Alertas] No salió el aviso de la alerta ${alerta.id}: ${e.message}`);
        }
      }
      return resumen;
    } catch (e) {
      log.error(`[Alertas] La revisión falló: ${e.message}`);
      return { ...resumen, error: 'interno' };
    } finally {
      enCurso = false;
    }
  };
}
