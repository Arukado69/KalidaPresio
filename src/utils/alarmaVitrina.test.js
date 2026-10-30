/**
 * Tests de la alarma de la vitrina.
 *
 * Lo que se protege es el equilibrio de siempre entre dos formas de fallar:
 *   · callar → el sitio pasa días con 0 ofertas sin que nadie se entere
 *     (pasó el 28 de octubre de 2026);
 *   · gritar de más → la alarma se vuelve ruido y se ignora.
 * Por eso se fijan las fronteras y lo que cuenta como «novedad».
 */
import { describe, it, expect } from 'vitest';
import {
  evaluarVitrina,
  evaluarEnVivo,
  diagnosticar,
  novedades,
  redactar,
  MINIMO_PUBLICABLES,
  HORAS_AVISO,
  MAX_HORAS_SIN_BUILD,
} from './alarmaVitrina.js';

const AHORA = Date.parse('2026-10-30T14:00:00Z');
const HORA = 3_600_000;
const DIA = 24 * HORA;

const producto = (n, haceDias = 1, extra = {}) => ({
  link: `https://meli.la/Prueba${n}`,
  titulo: `Producto ${n}`,
  precio: 100 + n,
  revisado: new Date(AHORA - haceDias * DIA).toISOString(),
  url_producto: `https://www.mercadolibre.com.mx/x/p/MLM5000000${n}`,
  ...extra,
});
const vitrina = (...productos) => ({ productos });

const feedVivo = (items, haceHoras = 2) => ({
  esquema: 2,
  generadoEl: new Date(AHORA - haceHoras * HORA).toISOString(),
  total: items.length,
  items,
});
const itemVivo = (haceDias = 1, extra = {}) => ({ id: 'MLM1', relampago: false, revisado: new Date(AHORA - haceDias * DIA).toISOString(), ...extra });
const vivoSano = feedVivo([itemVivo(), itemVivo(), itemVivo()]);

describe('evaluarVitrina — lo que VA a salir', () => {
  it('la vitrina vacía es alarma (lo que pasó el 28 de octubre)', () => {
    const r = evaluarVitrina(vitrina(), { ahora: AHORA });
    expect(r.publicables).toBe(0);
    expect(r.problemas.map((p) => p.clave)).toEqual(['vacia']);
  });

  it('productos sin link oficial no cuentan: salen en descartes con su motivo', () => {
    const r = evaluarVitrina(vitrina(producto(1, 1, { link: '' }), producto(2), producto(3), producto(4)), { ahora: AHORA });
    expect(r.publicables).toBe(3);
    expect(r.problemas).toEqual([]);
    expect(r.descartes).toHaveLength(1);
    expect(r.descartes[0].motivo).toMatch(/link oficial/);
  });

  it('por debajo del mínimo es alarma; en el mínimo, no', () => {
    expect(evaluarVitrina(vitrina(producto(1), producto(2)), { ahora: AHORA }).problemas[0].clave).toBe('pocos');
    expect(evaluarVitrina(vitrina(producto(1), producto(2), producto(3)), { ahora: AHORA }).problemas).toEqual([]);
    expect(MINIMO_PUBLICABLES).toBe(3);
  });

  it('avisa de los precios que se esconden en menos de 48 h, el más urgente primero', () => {
    const r = evaluarVitrina(vitrina(producto(1, 1), producto(2, 6.5), producto(3, 5.5)), { ahora: AHORA });
    expect(r.porCaducar.map((p) => p.titulo)).toEqual(['Producto 2', 'Producto 3']);
  });

  it('la frontera de las 48 h cuenta como aviso; un minuto antes, no', () => {
    const justo = 7 - HORAS_AVISO / 24;
    expect(evaluarVitrina(vitrina(producto(1, justo)), { ahora: AHORA }).porCaducar).toHaveLength(1);
    expect(evaluarVitrina(vitrina(producto(1, justo - 1 / 1440)), { ahora: AHORA }).porCaducar).toHaveLength(0);
  });

  it('las relámpago no generan aviso: se van solas en horas', () => {
    const r = evaluarVitrina(vitrina(producto(1, 6.5, { relampago: true })), { ahora: AHORA });
    expect(r.porCaducar).toEqual([]);
  });
});

describe('evaluarEnVivo — lo que la gente ve HOY', () => {
  it('un sitio que no responde es alarma', () => {
    expect(evaluarEnVivo(null, { ahora: AHORA }).map((p) => p.clave)).toEqual(['sin-respuesta']);
    expect(evaluarEnVivo([], { ahora: AHORA }).map((p) => p.clave)).toEqual(['sin-respuesta']);
  });

  it('un esquema que no es el 2 es alarma (n8n se negaría a publicar)', () => {
    expect(evaluarEnVivo({ esquema: 1, items: [] }, { ahora: AHORA }).map((p) => p.clave)).toEqual(['esquema']);
  });

  it('el feed en vivo vacío es alarma', () => {
    expect(evaluarEnVivo(feedVivo([]), { ahora: AHORA }).map((p) => p.clave)).toEqual(['en-vivo-vacio']);
  });

  it('un precio vencido publicado significa que al sitio le falta reconstruirse', () => {
    const r = evaluarEnVivo(feedVivo([itemVivo(), itemVivo(), itemVivo(8)]), { ahora: AHORA });
    expect(r.map((p) => p.clave)).toEqual(['en-vivo-vencidos']);
  });

  it('una relámpago vieja en el feed no cuenta como precio vencido', () => {
    expect(evaluarEnVivo(feedVivo([itemVivo(), itemVivo(), itemVivo(8, { relampago: true })]), { ahora: AHORA })).toEqual([]);
  });

  it('un build de hace más de 30 h es un deploy diario que dejó de correr', () => {
    expect(evaluarEnVivo(feedVivo(vivoSano.items, MAX_HORAS_SIN_BUILD), { ahora: AHORA })).toEqual([]);
    expect(evaluarEnVivo(feedVivo(vivoSano.items, MAX_HORAS_SIN_BUILD + 1), { ahora: AHORA }).map((p) => p.clave)).toEqual(['sin-build']);
    expect(evaluarEnVivo({ ...vivoSano, generadoEl: 'ayer' }, { ahora: AHORA }).map((p) => p.clave)).toEqual(['sin-build']);
  });

  it('un sitio sano no dice nada', () => {
    expect(evaluarEnVivo(vivoSano, { ahora: AHORA })).toEqual([]);
  });
});

describe('diagnosticar — un solo estado', () => {
  const sana = vitrina(producto(1), producto(2), producto(3));

  it('ok cuando todo está en orden', () => {
    const d = diagnosticar(evaluarVitrina(sana, { ahora: AHORA }), evaluarEnVivo(vivoSano, { ahora: AHORA }));
    expect(d.estado).toBe('ok');
    expect(d.claves).toEqual([]);
  });

  it('aviso cuando solo hay precios por esconderse', () => {
    const d = diagnosticar(evaluarVitrina(vitrina(producto(1), producto(2), producto(3, 6.5)), { ahora: AHORA }), []);
    expect(d.estado).toBe('aviso');
    expect(d.claves).toEqual([`caduca:MLM50000003@${new Date(AHORA - 6.5 * DIA).toISOString()}`]);
  });

  it('alarma gana a aviso, y junta lo del archivo con lo que está en vivo', () => {
    const d = diagnosticar(evaluarVitrina(vitrina(), { ahora: AHORA }), evaluarEnVivo(feedVivo([]), { ahora: AHORA }));
    expect(d.estado).toBe('alarma');
    expect(d.claves).toEqual(['vacia', 'en-vivo-vacio']);
  });
});

describe('novedades — avisar solo de lo nuevo', () => {
  const cuerpo = 'Estado…\n<!-- kp-alarma: vacia caduca:MLM1@2026-10-24T00:00:00.000Z -->\n';

  it('devuelve solo las claves que el issue anterior no traía', () => {
    expect(novedades(cuerpo, ['vacia', 'en-vivo-vacio'])).toEqual(['en-vivo-vacio']);
    expect(novedades(cuerpo, ['vacia'])).toEqual([]);
  });

  it('volver a revisar un producto cambia su clave: si vuelve a caducar, es novedad', () => {
    expect(novedades(cuerpo, ['caduca:MLM1@2026-10-31T00:00:00.000Z'])).toHaveLength(1);
  });

  it('sin issue anterior no hay novedades (abrir el issue ya avisa), y la basura no truena', () => {
    expect(novedades(null, ['vacia'])).toEqual([]);
    expect(novedades('un issue escrito a mano', ['vacia'])).toEqual([]);
    expect(novedades(cuerpo, null)).toEqual([]);
  });
});

describe('redactar — el issue que se lee desde el celular', () => {
  it('con el sitio vacío, el título lo dice sin rodeos y el cuerpo trae los pasos', () => {
    const v = evaluarVitrina(vitrina(producto(1, 1, { link: '' })), { ahora: AHORA });
    const d = diagnosticar(v, evaluarEnVivo(feedVivo([]), { ahora: AHORA }));
    const { titulo, cuerpo } = redactar(d, { sitio: 'https://kp.mx/', ahora: AHORA });
    expect(titulo).toBe('🔴 El sitio está publicando 0 ofertas');
    expect(cuerpo).toContain('### Lo que hay que atender');
    expect(cuerpo).toContain('### Fuera de la publicación');
    expect(cuerpo).toContain('falta el link oficial');
    expect(cuerpo).toContain('(https://kp.mx/panel/agregar)');
  });

  it('el cuerpo lleva escondidas las claves para la corrida siguiente', () => {
    const d = diagnosticar(evaluarVitrina(vitrina(), { ahora: AHORA }), []);
    const { cuerpo } = redactar(d, { ahora: AHORA });
    expect(novedades(cuerpo, d.claves)).toEqual([]);
    expect(novedades(cuerpo, [...d.claves, 'sin-build'])).toEqual(['sin-build']);
  });

  it('el aviso nombra el producto y cuándo se esconde, en hora de CDMX', () => {
    const d = diagnosticar(evaluarVitrina(vitrina(producto(1), producto(2), producto(3, 6.5)), { ahora: AHORA }), []);
    const { titulo, cuerpo } = redactar(d, { ahora: AHORA });
    expect(titulo).toBe('🟡 1 producto(s) de la vitrina se esconden en menos de 48 h');
    // 6.5 días antes de las 08:00 de CDMX → vence 12 h después, a las 20:00.
    expect(cuerpo).toContain('**Producto 3** — se esconde hoy a las 20:00');
  });

  it('el comentario de novedades solo trae lo nuevo', () => {
    const d = diagnosticar(evaluarVitrina(vitrina(), { ahora: AHORA }), evaluarEnVivo(feedVivo([]), { ahora: AHORA }));
    const { comentario } = redactar(d, { ahora: AHORA, nuevas: ['en-vivo-vacio'] });
    expect(comentario).toContain('El sitio en vivo muestra 0 producto(s).');
    expect(comentario).not.toContain('La vitrina tiene');
    expect(redactar(d, { ahora: AHORA }).comentario).toBe('');
  });

  it('un problema cualquiera se resume en el título hasta su primer «: »', () => {
    const d = diagnosticar(evaluarVitrina(vitrina(producto(1), producto(2), producto(3)), { ahora: AHORA }),
      evaluarEnVivo(feedVivo(vivoSano.items, 40), { ahora: AHORA }));
    expect(redactar(d, { ahora: AHORA }).titulo).toBe('🔴 Vitrina: El sitio no se reconstruye desde hace 40 h (debería hacerlo cada día)');
  });
});
