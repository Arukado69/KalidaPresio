import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import db from './db.js';
import { Transform } from 'node:stream';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy es crítico si estamos detrás de Nginx
app.set('trust proxy', 1);

// ── MIDDLEWARES ───────────────────────────────────────────────────────────────
// Parser de JSON
app.use(express.json());

// Configuración estricta de CORS
const dominiosPermitidos = ['http://localhost:4321', 'https://kalidapresio.com', 'https://www.kalidapresio.com'];
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (como cURL) o los que estén en la whitelist
    if (!origin || dominiosPermitidos.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: ['POST', 'GET'],
}));

// Rate Limiter: Máximo 5 peticiones por IP cada minuto
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 5, // Límite de 5 requests por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas peticiones, intenta más tarde.' }
});

// Aplicar el limitador solo a rutas /api
app.use('/api', apiLimiter);

// ── HELPERS ───────────────────────────────────────────────────────────────────
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || '').trim());
const sanitizar = (str) => (str || '').toString().trim().slice(0, 2000); // Max 2000 chars

// Queries preparadas por seguridad y rendimiento
const stmtInsertContact = db.prepare(`
  INSERT INTO contactos (nombre, email, asunto, mensaje, ip)
  VALUES (?, ?, ?, ?, ?)
`);

const stmtInsertSubscriber = db.prepare(`
  INSERT INTO suscriptores (email, ip)
  VALUES (?, ?)
`);

// ── ENDPOINTS ─────────────────────────────────────────────────────────────────

/**
 * POST /api/contact
 * Recibe el formulario de contacto.
 */
app.post('/api/contact', (req, res) => {
  try {
    const { nombre, email, mensaje, honeypot } = req.body;
    
    // Validar honeypot: Si viene lleno, es un bot tonto.
    // Respondemos OK para que crea que tuvo éxito, pero lo ignoramos.
    if (honeypot) {
      console.warn(`[Contact] Bot detectado y bloqueado (honeypot): IP ${req.ip}`);
      return res.status(200).json({ ok: true });
    }

    // Validación estricta
    const nombreClean = sanitizar(nombre);
    const emailClean = sanitizar(email);
    const mensajeClean = sanitizar(mensaje);
    // En nuestro form, el asunto se manda prefijado en el mensaje: "[Asunto] Mensaje..."
    // Vamos a extraer el asunto si existe, si no, "General"
    let asuntoStr = 'General';
    let mensajeCuerpo = mensajeClean;
    const matchAsunto = mensajeClean.match(/^\[(.*?)\] (.*)$/s);
    if (matchAsunto) {
      asuntoStr = sanitizar(matchAsunto[1]);
      mensajeCuerpo = sanitizar(matchAsunto[2]);
    }

    if (!nombreClean || !emailOk(emailClean) || mensajeCuerpo.length < 5) {
      return res.status(400).json({ ok: false, error: 'Campos inválidos' });
    }

    // Inserción en SQLite
    stmtInsertContact.run(nombreClean, emailClean, asuntoStr, mensajeCuerpo, req.ip);

    console.log(`[Contact] Mensaje recibido de ${emailClean}`);
    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error(`[Contact] Error:`, error);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/subscribe
 * Recibe el formulario del Newsletter.
 */
app.post('/api/subscribe', (req, res) => {
  try {
    const { email, honeypot } = req.body;

    // Validar honeypot
    if (honeypot) {
      console.warn(`[Newsletter] Bot detectado y bloqueado (honeypot): IP ${req.ip}`);
      return res.status(200).json({ ok: true });
    }

    const emailClean = sanitizar(email).toLowerCase();

    if (!emailOk(emailClean)) {
      return res.status(400).json({ ok: false, error: 'email_invalido' });
    }

    try {
      // Inserción en SQLite nativo
      stmtInsertSubscriber.run(emailClean, req.ip);
      console.log(`[Newsletter] Nuevo suscriptor: ${emailClean}`);
    } catch (dbError) {
      // node:sqlite lanza un error con un mensaje que contiene UNIQUE constraint
      if (dbError.message && dbError.message.includes('UNIQUE constraint failed')) {
        // Para no filtrar correos registrados a posibles atacantes, simplemente
        // respondemos con éxito como si se hubiera guardado.
        console.log(`[Newsletter] Email ya estaba suscrito: ${emailClean}`);
      } else {
        throw dbError; // Si es otro error, lo pasamos al catch general
      }
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error(`[Newsletter] Error:`, error);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/export/subscribers
 * Endpoint protegido para exportar la base de datos de correos a CSV.
 * OJO: Aquí implementamos una seguridad básica por query param "token".
 * Cambia el token por uno más seguro en producción o usa Authorization Headers.
 */
app.get('/api/export/subscribers', (req, res) => {
  try {
    const { token } = req.query;
    // REEMPLAZAR ESTE TOKEN en producción
    const SECRET_EXPORT_TOKEN = process.env.EXPORT_TOKEN || 'kalida-export-1234';

    if (token !== SECRET_EXPORT_TOKEN) {
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }

    const stmt = db.prepare(`SELECT email, fecha, ip FROM suscriptores ORDER BY fecha DESC`);
    const suscriptores = stmt.all();

    // Configurar cabeceras para forzar descarga CSV
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="suscriptores.csv"');

    // Escribir cabeceras CSV
    res.write('email,fecha,ip\n');

    // Procesar resultados (útil para muchos registros)
    for (const sub of suscriptores) {
      res.write(`${sub.email},${sub.fecha},${sub.ip || ''}\n`);
    }

    res.end();
    console.log(`[Export] ${suscriptores.length} suscriptores exportados exitosamente.`);

  } catch (error) {
    console.error(`[Export] Error:`, error);
    return res.status(500).json({ ok: false, error: 'Error al exportar datos' });
  }
});

// Manejador genérico para rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Endpoint no encontrado' });
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 [Backend] Servidor iniciado en http://127.0.0.1:${PORT}`);
  console.log(`🛡️ [Backend] CORS restringido. Rate Limit activo (5 req/min).`);
});
