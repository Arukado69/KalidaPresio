import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta de la DB: en contenedor usa DB_PATH (volumen persistente); en local,
// el archivo junto al código. Así los suscriptores no se pierden al recrear
// el contenedor.
const dbPath = process.env.DB_PATH || path.resolve(__dirname, 'database.sqlite');
const db = new DatabaseSync(dbPath);

// Habilitar WAL (Write-Ahead Logging) para mejor concurrencia y rendimiento
db.exec('PRAGMA journal_mode = WAL');

// ── ESQUEMAS ESTRICTOS ────────────────────────────────────────────────────────
// Tabla para guardar los mensajes de contacto
db.exec(`
  CREATE TABLE IF NOT EXISTS contactos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL,
    asunto TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    ip TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Tabla para guardar las suscripciones al newsletter
// email es UNIQUE para evitar registros duplicados
db.exec(`
  CREATE TABLE IF NOT EXISTS suscriptores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    ip TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ── MIGRACIONES ADITIVAS ──────────────────────────────────────────────────────
// Idempotentes: se intentan en cada arranque y se ignora el error de "ya
// existe". node:sqlite no tiene `ADD COLUMN IF NOT EXISTS`, así que el try/catch
// ES el mecanismo. Cada una debe ser segura de re-ejecutar.
const columnas = new Set(
  db.prepare(`SELECT name FROM pragma_table_info('suscriptores')`).all().map((c) => c.name),
);

const migraciones = [
  // Estado del doble opt-in. Las filas previas a esta columna se marcan como
  // 'pendiente': se dieron de alta cuando no había confirmación, así que no
  // podemos afirmar que consintieron. Confírmalas antes de escribirles.
  ['estado', `ALTER TABLE suscriptores ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendiente'`],
  // Cuándo confirmó (evidencia de consentimiento; útil si alguien reclama).
  ['confirmado_en', `ALTER TABLE suscriptores ADD COLUMN confirmado_en DATETIME`],
  // Cuándo se dio de baja (no se borra la fila: así no se le vuelve a escribir
  // si se resuscribe por error desde otro formulario).
  ['baja_en', `ALTER TABLE suscriptores ADD COLUMN baja_en DATETIME`],
];

for (const [nombre, sql] of migraciones) {
  if (columnas.has(nombre)) continue;
  try {
    db.exec(sql);
    console.log(`🔧 [DB] Migración aplicada: suscriptores.${nombre}`);
  } catch (e) {
    console.error(`❌ [DB] No se pudo aplicar la migración ${nombre}: ${e.message}`);
    throw e;
  }
}

// Índice para el export y para los conteos por estado.
db.exec(`CREATE INDEX IF NOT EXISTS idx_suscriptores_estado ON suscriptores(estado)`);

const total = db.prepare(`SELECT COUNT(*) AS n FROM suscriptores`).get().n;
const confirmados = db.prepare(`SELECT COUNT(*) AS n FROM suscriptores WHERE estado = 'confirmado'`).get().n;
console.log(`✅ [DB] Base inicializada. Suscriptores: ${total} (${confirmados} confirmados).`);

export default db;
