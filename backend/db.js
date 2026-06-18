import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar la base de datos de forma segura usando node:sqlite nativo
const dbPath = path.resolve(__dirname, 'database.sqlite');
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

console.log('✅ [DB] Base de datos inicializada y esquemas validados.');

export default db;
