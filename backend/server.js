// backend/server.js — API de KalidaPresio (contacto + boletín con doble opt-in).
//
// Corre detrás de DOS proxies: Nginx Proxy Manager (TLS, host) → Caddy
// (contenedor web) → aquí. De ahí TRUST_PROXY=2 por defecto: con un valor
// menor, express-rate-limit vería siempre la IP de Caddy y limitaría a TODO el
// mundo con el mismo cubo.

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import db from './db.js';
import { crearToken, verificarToken, emailValido, secretoIgual } from './token.js';
import {
  enviarCorreo,
  espConfigurado,
  escapeHtml,
  correoConfirmacion,
  correoBienvenida,
} from './email.js';

const app = express();
const PORT = process.env.PORT || 3001;
const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://kalidapresio.com').replace(/\/$/, '');
const SUBSCRIBE_SECRET = process.env.SUBSCRIBE_SECRET || '';
const EXPORT_TOKEN = process.env.EXPORT_TOKEN || '';
const SUPPORT_INBOX = process.env.SUPPORT_INBOX || '';

// ── ARRANQUE: decir en voz alta qué está y qué no ─────────────────────────────
// Un backend que arranca "bien" pero con medio boletín apagado es cómo se
// acumulan correos que nadie puede contestar. Que el log lo diga desde el
// segundo cero.
const avisos = [];
if (!SUBSCRIBE_SECRET) avisos.push('SUBSCRIBE_SECRET ausente → /api/subscribe responderá 503.');
if (!espConfigurado()) avisos.push('RESEND_API_KEY ausente → no se pueden enviar correos.');
if (!EXPORT_TOKEN) avisos.push('EXPORT_TOKEN ausente → /api/export/subscribers responderá 503.');
if (!SUPPORT_INBOX) avisos.push('SUPPORT_INBOX ausente → los mensajes solo se guardan en la base.');

// Trust proxy: NPM + Caddy = 2 saltos. Configurable por si cambia la topología.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 2));

// ── MIDDLEWARES ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '32kb' }));

// Configuración estricta de CORS
const dominiosPermitidos = [
  'http://localhost:4321',
  'https://kalidapresio.com',
  'https://www.kalidapresio.com',
  ...(process.env.CORS_EXTRA_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
];
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

// Rate limiter de los formularios: 5 peticiones por IP cada minuto.
const limitadorFormularios = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas peticiones, intenta más tarde.' },
});

// Limitador propio y MUCHO más estrecho para el export: es el endpoint que
// entrega datos personales, así que un token filtrado no debe poder tantearse
// a 5 intentos por minuto indefinidamente.
const limitadorExport = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos.' },
});

// ── HELPERS ───────────────────────────────────────────────────────────────────
const sanitizar = (str) => (str || '').toString().trim().slice(0, 2000);

const stmtInsertContact = db.prepare(`
  INSERT INTO contactos (nombre, email, asunto, mensaje, ip)
  VALUES (?, ?, ?, ?, ?)
`);

// UPSERT: si el correo ya existe (p. ej. se dio de baja y vuelve), se reactiva
// en vez de fallar por la restricción UNIQUE.
const stmtConfirmarSuscriptor = db.prepare(`
  INSERT INTO suscriptores (email, ip, estado, confirmado_en, baja_en)
  VALUES (?, ?, 'confirmado', CURRENT_TIMESTAMP, NULL)
  ON CONFLICT(email) DO UPDATE SET
    estado = 'confirmado',
    confirmado_en = CURRENT_TIMESTAMP,
    baja_en = NULL
`);

const stmtBaja = db.prepare(`
  UPDATE suscriptores SET estado = 'baja', baja_en = CURRENT_TIMESTAMP WHERE email = ?
`);

/** Página HTML mínima con los tokens de marca (no depende del CSS del sitio). */
function pagina(titulo, mensaje, ok, status) {
  const acento = ok ? '#1fd28e' : '#ff5d76';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(titulo)} — KalidaPresio</title><meta name="robots" content="noindex"></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#140e1f;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#f0eef8">
  <main style="max-width:480px;padding:40px 28px;text-align:center">
    <div style="font-size:34px;font-weight:800;color:${acento};margin-bottom:6px">KalidaPresio</div>
    <h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(titulo)}</h1>
    <p style="font-size:15px;line-height:1.6;color:#c9c3e0;margin:0 0 28px">${mensaje}</p>
    <a href="${SITE_URL}/" style="display:inline-block;background:${acento};color:#0b231a;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:10px">Ir al inicio</a>
  </main>
</body></html>`;
}

const responderHtml = (res, status, html) =>
  res.status(status).type('text/html; charset=utf-8').send(html);

const enlaceBaja = (email) =>
  `${SITE_URL}/api/baja?token=${encodeURIComponent(
    // 2 años: este enlace viaja en cada correo y tiene que seguir sirviendo
    // meses después. Un enlace de baja caducado es una queja de spam.
    crearToken(email, SUBSCRIBE_SECRET, 'baja', 730 * 24 * 60 * 60 * 1000),
  )}`;

// ── ENDPOINTS ─────────────────────────────────────────────────────────────────

/**
 * POST /api/contact — formulario de contacto.
 * Guarda en SQLite y, si hay ESP + SUPPORT_INBOX, avisa por correo con
 * reply-to del usuario (antes solo se guardaba: había que entrar a la base
 * a mano para enterarse de que alguien había escrito).
 */
app.post('/api/contact', limitadorFormularios, async (req, res) => {
  try {
    const { nombre, email, mensaje, honeypot } = req.body;

    // Honeypot lleno → bot. Respondemos OK falso y descartamos en silencio.
    if (honeypot) {
      console.warn(`[Contact] Bot detectado y bloqueado (honeypot): IP ${req.ip}`);
      return res.status(200).json({ ok: true });
    }

    const nombreClean = sanitizar(nombre);
    const emailClean = sanitizar(email).toLowerCase();
    const mensajeClean = sanitizar(mensaje);

    // En el form, el asunto llega prefijado en el mensaje: "[Asunto] Mensaje…"
    let asuntoStr = 'General';
    let mensajeCuerpo = mensajeClean;
    const matchAsunto = mensajeClean.match(/^\[(.*?)\] (.*)$/s);
    if (matchAsunto) {
      asuntoStr = sanitizar(matchAsunto[1]);
      mensajeCuerpo = sanitizar(matchAsunto[2]);
    }

    if (!nombreClean || !emailValido(emailClean) || mensajeCuerpo.length < 5) {
      return res.status(400).json({ ok: false, error: 'Campos inválidos' });
    }

    stmtInsertContact.run(nombreClean, emailClean, asuntoStr, mensajeCuerpo, req.ip);
    console.log(`[Contact] Mensaje recibido de ${emailClean} (${asuntoStr})`);

    // El aviso por correo es best-effort: el mensaje YA está guardado, así que
    // un ESP caído no debe hacer que el usuario vea un error.
    if (SUPPORT_INBOX && espConfigurado()) {
      try {
        await enviarCorreo({
          to: SUPPORT_INBOX,
          replyTo: emailClean,
          subject: `Soporte KalidaPresio — ${asuntoStr} — ${nombreClean}`,
          text: `De: ${nombreClean} <${emailClean}>\n\n${mensajeCuerpo}`,
          html: `<p><strong>De:</strong> ${escapeHtml(nombreClean)} &lt;${escapeHtml(emailClean)}&gt;</p>
                 <p><strong>Asunto:</strong> ${escapeHtml(asuntoStr)}</p>
                 <p style="white-space:pre-wrap">${escapeHtml(mensajeCuerpo)}</p>`,
        });
      } catch (e) {
        console.error(`[Contact] Guardado en la base, pero el aviso por correo falló: ${e.message}`);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Contact] Error:', error);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/subscribe — paso 1 del doble opt-in.
 * NO guarda nada: firma un token y manda el correo de confirmación. El alta
 * solo ocurre en /api/confirm, cuando la persona demuestra que el correo es
 * suyo. (Antes se insertaba directo, sin confirmar y sin forma de escribirle.)
 */
app.post('/api/subscribe', limitadorFormularios, async (req, res) => {
  try {
    const { email, honeypot } = req.body;

    if (honeypot) {
      console.warn(`[Boletín] Bot detectado y bloqueado (honeypot): IP ${req.ip}`);
      return res.status(200).json({ ok: true });
    }

    const emailClean = sanitizar(email).toLowerCase();
    if (!emailValido(emailClean)) {
      return res.status(400).json({ ok: false, error: 'email_invalido' });
    }

    if (!SUBSCRIBE_SECRET || !espConfigurado()) {
      console.error('[Boletín] Falta SUBSCRIBE_SECRET o RESEND_API_KEY: no se puede confirmar a nadie.');
      return res.status(503).json({ ok: false, error: 'config_incompleta' });
    }

    const token = crearToken(emailClean, SUBSCRIBE_SECRET, 'alta'); // 24 h
    const enlace = `${SITE_URL}/api/confirm?token=${encodeURIComponent(token)}`;

    await enviarCorreo({
      to: emailClean,
      subject: 'Confirma tu suscripción a KalidaPresio',
      text: `Confirma tu suscripción abriendo este enlace (válido 24 h): ${enlace}\n\nSi no fuiste tú, ignora este correo.`,
      html: correoConfirmacion(enlace),
    });

    console.log(`[Boletín] Correo de confirmación enviado a ${emailClean}`);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Boletín] No se pudo enviar la confirmación:', error.message);
    return res.status(502).json({ ok: false, error: 'envio_fallido' });
  }
});

/**
 * GET /api/confirm?token=… — paso 2 del doble opt-in.
 * Verifica firma + vigencia y ahí sí da de alta. Devuelve HTML porque se abre
 * desde el cliente de correo.
 */
app.get('/api/confirm', limitadorFormularios, async (req, res) => {
  if (!SUBSCRIBE_SECRET) {
    return responderHtml(res, 503, pagina(
      'Configuración incompleta',
      'No podemos confirmar ahora mismo. Inténtalo más tarde.',
      false,
    ));
  }

  const r = verificarToken(String(req.query.token || ''), SUBSCRIBE_SECRET, 'alta');
  if (!r.ok) {
    const msg = r.error === 'expirado'
      ? 'Este enlace de confirmación caducó (era válido 24 h). Vuelve a suscribirte para recibir uno nuevo.'
      : 'Este enlace de confirmación no es válido.';
    return responderHtml(res, 400, pagina('Enlace no válido', msg, false));
  }

  try {
    stmtConfirmarSuscriptor.run(r.email, req.ip);
    console.log(`[Boletín] Alta confirmada: ${r.email}`);
  } catch (e) {
    console.error('[Boletín] Error al guardar el alta confirmada:', e.message);
    return responderHtml(res, 500, pagina(
      'Algo salió mal',
      'Tu confirmación es válida pero no pudimos guardarla. Escríbenos y lo resolvemos.',
      false,
    ));
  }

  // Bienvenida con enlace de baja: best-effort, el alta ya está hecha.
  if (espConfigurado()) {
    try {
      await enviarCorreo({
        to: r.email,
        subject: '¡Listo! Ya estás suscrito a KalidaPresio',
        text: `Ya estás dentro. Para darte de baja cuando quieras: ${enlaceBaja(r.email)}`,
        html: correoBienvenida(enlaceBaja(r.email)),
      });
    } catch (e) {
      console.error('[Boletín] Confirmado, pero la bienvenida no salió:', e.message);
    }
  }

  return responderHtml(res, 200, pagina(
    '¡Suscripción confirmada! 🎉',
    `Listo, <strong>${escapeHtml(r.email)}</strong> quedó suscrito. Te escribiremos solo cuando encontremos algo que de verdad valga la pena.`,
    true,
  ));
});

/**
 * GET /api/baja?token=… — baja en un clic desde cualquier correo.
 * El copy del sitio prometía "te das de baja cuando quieras" y no existía
 * ningún mecanismo. Ahora sí.
 */
app.get('/api/baja', limitadorFormularios, (req, res) => {
  if (!SUBSCRIBE_SECRET) {
    return responderHtml(res, 503, pagina(
      'Configuración incompleta',
      'No podemos procesar la baja ahora mismo. Escríbenos y lo hacemos a mano.',
      false,
    ));
  }

  const r = verificarToken(String(req.query.token || ''), SUBSCRIBE_SECRET, 'baja');
  if (!r.ok) {
    return responderHtml(res, 400, pagina(
      'Enlace no válido',
      'Este enlace de baja no es válido. Escríbenos desde el formulario de contacto y te damos de baja a mano.',
      false,
    ));
  }

  try {
    stmtBaja.run(r.email);
    console.log(`[Boletín] Baja procesada: ${r.email}`);
  } catch (e) {
    console.error('[Boletín] Error al procesar la baja:', e.message);
    return responderHtml(res, 500, pagina(
      'Algo salió mal',
      'No pudimos procesar la baja. Escríbenos y lo hacemos a mano de inmediato.',
      false,
    ));
  }

  return responderHtml(res, 200, pagina(
    'Te diste de baja',
    'No volveremos a escribirte. Si fue un error, puedes suscribirte otra vez desde el sitio cuando quieras.',
    true,
  ));
});

/**
 * GET /api/export/subscribers — exporta los suscriptores a CSV.
 *
 * SEGURIDAD (esto entrega datos personales):
 *  · Sin EXPORT_TOKEN en el entorno → 503. NO hay valor por defecto: el
 *    anterior ('kalida-export-1234') estaba escrito en el repo, así que un
 *    .env ausente en el VPS dejaba la lista entera al alcance de cualquiera.
 *  · El token va en la cabecera Authorization, no en la query: un ?token=… se
 *    queda escrito en los access logs de Nginx y de Caddy.
 *  · Comparación en tiempo constante.
 */
app.get('/api/export/subscribers', limitadorExport, (req, res) => {
  try {
    if (!EXPORT_TOKEN) {
      console.error('[Export] EXPORT_TOKEN no está configurado; endpoint deshabilitado.');
      return res.status(503).json({ ok: false, error: 'export_deshabilitado' });
    }

    const cabecera = req.get('authorization') || '';
    const recibido = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
    if (!recibido || !secretoIgual(recibido, EXPORT_TOKEN)) {
      console.warn(`[Export] Intento no autorizado desde ${req.ip}`);
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }

    // Solo los confirmados: son los únicos a los que se les puede escribir.
    // ?todos=1 devuelve también pendientes y bajas (para auditar la lista).
    const todos = req.query.todos === '1';
    const stmt = todos
      ? db.prepare(`SELECT email, estado, fecha, confirmado_en, baja_en FROM suscriptores ORDER BY fecha DESC`)
      : db.prepare(`SELECT email, estado, fecha, confirmado_en, baja_en FROM suscriptores WHERE estado = 'confirmado' ORDER BY fecha DESC`);
    const suscriptores = stmt.all();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="suscriptores-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('Cache-Control', 'no-store');

    // Escapado CSV: un correo no lleva comas, pero las fechas y estados salen
    // de la base y no cuesta nada no confiar.
    const csv = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    res.write('email,estado,alta,confirmado_en,baja_en\n');
    for (const s of suscriptores) {
      res.write([s.email, s.estado, s.fecha, s.confirmado_en, s.baja_en].map(csv).join(',') + '\n');
    }
    res.end();
    console.log(`[Export] ${suscriptores.length} suscriptores exportados.`);
  } catch (error) {
    console.error('[Export] Error:', error);
    return res.status(500).json({ ok: false, error: 'Error al exportar datos' });
  }
});

// Healthcheck (lo usa docker-compose para saber si el contenedor está sano)
app.get('/health', (req, res) => res.status(200).json({ ok: true }));

// Manejador genérico para rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Endpoint no encontrado' });
});

// ── START ─────────────────────────────────────────────────────────────────────
// HOST: en contenedor = 0.0.0.0 (alcanzable por Caddy en la red interna);
// en bare-metal detrás de nginx local podrías fijar HOST=127.0.0.1.
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`🚀 [Backend] Servidor iniciado en http://${HOST}:${PORT}`);
  console.log(`🛡️  [Backend] CORS restringido · rate limit 5/min · trust proxy = ${app.get('trust proxy')}`);
  if (avisos.length) {
    console.warn('⚠️  [Backend] Configuración incompleta:');
    for (const a of avisos) console.warn(`   · ${a}`);
  } else {
    console.log('✅ [Backend] Configuración completa: boletín, contacto y export operativos.');
  }
});
