/**
 * Tests de la lógica de negocio pura.
 *
 * Son las cuatro funciones que deciden QUÉ se muestra, EN QUÉ ORDEN y A DÓNDE
 * lleva el clic. Ninguna toca red, disco ni DOM, así que blindarlas cuesta
 * poco y protege el camino del dinero.
 */
import { describe, it, expect } from 'vitest';
import { calcularScorePorSeccion, scoreEfectivo, PESOS_SECCION } from './scoreSecciones.js';
import { aLinkAfiliado } from './afiliado.js';
import { categorizar, ORDEN_CATEGORIAS } from './categorias.js';
import { generarVeredicto, tierKP } from './veredicto.js';

describe('calcularScorePorSeccion', () => {
  it('da 100 al item perfecto con pesos estándar', () => {
    expect(calcularScorePorSeccion({ rating: 5, descuento: 40, vendidos: 100_000 }, 'relampago')).toBe(100);
  });

  it('da 0 cuando no hay ninguna señal', () => {
    expect(calcularScorePorSeccion({ rating: 0, descuento: 0, vendidos: 0 }, 'relampago')).toBe(0);
  });

  it('topa el descuento en 40%: 60% no puntúa más que 40%', () => {
    const base = { rating: 4, vendidos: 1000 };
    expect(calcularScorePorSeccion({ ...base, descuento: 60 }, 'default'))
      .toBe(calcularScorePorSeccion({ ...base, descuento: 40 }, 'default'));
  });

  it('satura el volumen a partir de 100 mil vendidos', () => {
    const base = { rating: 4, descuento: 20 };
    expect(calcularScorePorSeccion({ ...base, vendidos: 250_000 }, 'default'))
      .toBe(calcularScorePorSeccion({ ...base, vendidos: 100_000 }, 'default'));
  });

  it('en imbatibles el volumen pesa más que el descuento (decisión 2026-06-11)', () => {
    // Un item SIN descuento pero con muchas opiniones no debe hundirse: los
    // imbatibles son precio-permanente-bajo y ML no manda previous_price.
    const sinDescuento = { rating: 4.8, descuento: 0, vendidos: 10_000 };
    expect(calcularScorePorSeccion(sinDescuento, 'imbatibles'))
      .toBeGreaterThan(calcularScorePorSeccion(sinDescuento, 'default'));
    expect(PESOS_SECCION.imbatibles.volumen).toBeGreaterThan(PESOS_SECCION.default.volumen);
  });

  it('una sección desconocida cae en los pesos por defecto', () => {
    const item = { rating: 4.2, descuento: 25, vendidos: 3000 };
    expect(calcularScorePorSeccion(item, 'seccion-que-no-existe'))
      .toBe(calcularScorePorSeccion(item, 'default'));
  });

  it('no truena con campos ausentes ni valores fuera de rango', () => {
    expect(calcularScorePorSeccion({}, 'default')).toBe(0);
    expect(calcularScorePorSeccion({ rating: 9, descuento: -5, vendidos: -100 }, 'default')).toBe(65);
  });
});

describe('scoreEfectivo', () => {
  it('respeta el score ya persistido en el feed', () => {
    expect(scoreEfectivo({ score_kalidad_presio: 42, rating: 5, vendidos: 100_000, descuento: 40 })).toBe(42);
  });

  it('lo recalcula cuando falta', () => {
    expect(scoreEfectivo({ rating: 5, descuento: 40, vendidos: 100_000 })).toBe(100);
  });

  it('conserva un score persistido de 0 (no lo confunde con "ausente")', () => {
    expect(scoreEfectivo({ score_kalidad_presio: 0, rating: 5 })).toBe(0);
  });
});

describe('aLinkAfiliado — el camino del dinero', () => {
  const URL_ML = 'https://www.mercadolibre.com.mx/producto/p/MLM123';

  it('pega matt_tool y matt_word a una URL limpia', () => {
    const r = new URL(aLinkAfiliado(URL_ML));
    expect(r.searchParams.get('matt_tool')).toBeTruthy();
    expect(r.searchParams.get('matt_word')).toBeTruthy();
  });

  it('descarta los parámetros previos en vez de acumularlos', () => {
    const r = aLinkAfiliado(`${URL_ML}?matt_tool=OTRO&utm_source=facebook#resenas`);
    expect(r).not.toContain('OTRO');
    expect(r).not.toContain('utm_source');
    expect(r).not.toContain('#resenas');
  });

  it('etiqueta canal y sección en el matt_word', () => {
    // El sufijo es `<canal><seccion>`; sin canal explícito, el canal es el
    // sitio ('wb'). Ver canales.js para por qué el canal va SIEMPRE delante.
    const base = new URL(aLinkAfiliado(URL_ML)).searchParams.get('matt_word');
    const delSitio = new URL(aLinkAfiliado(URL_ML, 'relampago')).searchParams.get('matt_word');
    const deTelegram = new URL(aLinkAfiliado(URL_ML, 'relampago', 'tg')).searchParams.get('matt_word');
    expect(delSitio).toBe(`${base}_wbrelampago`);
    expect(deTelegram).toBe(`${base}_tgrelampago`);
  });

  it('sanea la campaña: nada que rompa el parámetro', () => {
    const word = new URL(aLinkAfiliado(URL_ML, 'menos-500 &raro')).searchParams.get('matt_word');
    expect(word).toMatch(/_wbmenos500raro$/);
  });

  it('degrada a "#" con entradas inservibles en vez de generar un enlace roto', () => {
    for (const malo of [null, undefined, '', '   ', 42, {}]) {
      expect(aLinkAfiliado(malo)).toBe('#');
    }
  });
});

describe('categorizar', () => {
  it('clasifica por palabra clave del título', () => {
    expect(categorizar('Laptop Gamer Lenovo IdeaPad 15.6"')).toBe('Tecnología');
    expect(categorizar('Licuadora Oster de vaso de vidrio')).toBe('Cocina');
    expect(categorizar('Colchón Matrimonial Memory Foam')).toBe('Hogar');
    expect(categorizar('CeraVe Crema Hidratante Facial 454 g')).toBe('Belleza');
    expect(categorizar('Proteína Whey 2 kg chocolate')).toBe('Salud y Deporte');
    expect(categorizar('Taladro inalámbrico 20V')).toBe('Herramientas');
  });

  it('ignora mayúsculas y acentos del catálogo real', () => {
    expect(categorizar('AUDÍFONOS Bluetooth')).toBe('Tecnología');
    expect(categorizar('audifonos bluetooth')).toBe('Tecnología');
  });

  it('clasifica las categorías añadidas para el detector de nichos', () => {
    expect(categorizar('Croquetas para Perro Adulto Salmón 10kg Purina Beneful')).toBe('Mascotas');
    expect(categorizar('Batería Italika Iytx7a-bs para moto 250z')).toBe('Autos y Motos');
    expect(categorizar('Don Julio 70 Tequila Cristalino Añejo 700ml')).toBe('Bebidas');
    expect(categorizar('Cuadernos Cosidos Profesional Ferrini Libreta 100h 8 Pack')).toBe('Papelería');
  });

  // ── Las trampas de precedencia ────────────────────────────────────────────
  // Cada una de estas es un bug que YA ocurrió. El orden de REGLAS es lo único
  // que las resuelve, así que reordenar el archivo tiene que romper esto.

  it('«camara» contiene «cama»: una cámara de seguridad NO es Hogar', () => {
    expect(categorizar('Camara De Seguridad Exterior WiFi 12MP PTZ 360')).toBe('Tecnología');
    expect(categorizar('Cámara de vigilancia exterior wifi audio')).toBe('Tecnología');
    // Y una cama sigue siendo una cama.
    expect(categorizar('Cama Individual con Cabecera Tapizada')).toBe('Hogar');
  });

  it('el salmón de las croquetas no es un suplemento', () => {
    expect(categorizar('Croquetas para Perro Salmón Salud Radiante')).toBe('Mascotas');
    expect(categorizar('Omega 3 De Salmón 90 Cápsulas EPA DHA')).toBe('Salud y Deporte');
  });

  it('«Moto G» es un celular, no una autoparte', () => {
    expect(categorizar('Celular Moto G15 256gb 8ram Verde')).toBe('Tecnología');
    expect(categorizar('Motocicleta Italika DS150')).toBe('Autos y Motos');
  });

  it('«para auto» es pista débil: no le gana a un electrodoméstico', () => {
    expect(categorizar('Aspiradora Industrial Lava Tapicería para autos y casa')).toBe('Hogar');
    // Pero sí clasifica lo que nadie más reclama.
    expect(categorizar('Amplificador De Audio Para Auto 4 Canales Clase D 2400w')).toBe('Autos y Motos');
  });

  it('el lápiz óptico de una tablet es una tablet', () => {
    expect(categorizar('Tablet Huawei MatePad SE 11 128G + lápiz óptico')).toBe('Tecnología');
    expect(categorizar('Super Tips Crayola 100 Plumones Lavables')).toBe('Papelería');
  });

  it('una crema con vitamina C es cosmético, no suplemento', () => {
    expect(categorizar('Crema facial con Vitamina C 50ml')).toBe('Belleza');
    expect(categorizar('Vitamina C 1000mg 60 tabletas')).toBe('Salud y Deporte');
  });

  it('degrada a "Otros" y nunca truena', () => {
    expect(categorizar('Objeto sin categoría reconocible')).toBe('Otros');
    expect(categorizar('')).toBe('Otros');
    expect(categorizar()).toBe('Otros');
  });

  it('toda categoría que puede devolver está en el orden de los chips', () => {
    // Una categoría nueva tiene que entrar en REGLAS *y* en ORDEN_CATEGORIAS.
    // Si solo entra en la primera, desaparece del filtro sin avisar.
    const muestras = [
      'laptop', 'licuadora', 'colchón', 'crema', 'creatina', 'pijama', 'taladro',
      'croquetas para perro', 'motocicleta', 'tequila', 'cuaderno', 'zzz',
    ];
    for (const t of muestras) {
      expect(ORDEN_CATEGORIAS).toContain(categorizar(t));
    }
  });
});

describe('tierKP', () => {
  it('corta en los mismos umbrales que el sello visual', () => {
    expect(tierKP(95)).toBe('Excepcional');
    expect(tierKP(90)).toBe('Excepcional');
    expect(tierKP(89)).toBe('Excelente');
    expect(tierKP(80)).toBe('Excelente');
    expect(tierKP(79)).toBe('Buena');
    expect(tierKP(70)).toBe('Buena');
    expect(tierKP(69)).toBe('Aceptable');
    expect(tierKP(55)).toBe('Aceptable');
    expect(tierKP(54)).toBe('Baja');
  });

  it('trata la ausencia de score como 0, no como NaN', () => {
    expect(tierKP(undefined)).toBe('Baja');
    expect(tierKP('no es un número')).toBe('Baja');
  });
});

describe('generarVeredicto', () => {
  it('abre por volumen de ventas cuando esa es la señal más fuerte', () => {
    // ML retiró la insignia "MÁS VENDIDO": el umbral de 10 mil unidades hace el
    // mismo papel y es un dato publicado, no una etiqueta editorial.
    const v = generarVeredicto({ rating: 4.7, vendidos: 12_000, descuento: 10 });
    expect(v).toMatch(/más vendido/i);
    expect(v).toContain('4.7');
  });

  it('abre por el descuento cuando es grande y la calificación aguanta', () => {
    expect(generarVeredicto({ rating: 4.6, vendidos: 3000, descuento: 55 })).toMatch(/55%/);
  });

  it('formatea los miles de unidades de forma legible', () => {
    expect(generarVeredicto({ rating: 4.8, vendidos: 1200 })).toContain('1.2 mil');
    expect(generarVeredicto({ rating: 4.8, vendidos: 15_000 })).toContain('15 mil');
  });

  it('cierra con las señales de confianza que existan', () => {
    const base = { rating: 4.5, vendidos: 2000 };
    expect(generarVeredicto({ ...base, vendedor_confiable: true, envio_gratis: true }))
      .toContain('Vendedor reputado y envío gratis.');
    expect(generarVeredicto({ ...base, envio_gratis: true })).toContain('Con envío gratis.');
    expect(generarVeredicto({ ...base, vendedor_confiable: true })).toContain('De un vendedor reputado.');
  });

  it('nunca devuelve vacío, ni sin datos', () => {
    expect(generarVeredicto({}).length).toBeGreaterThan(10);
    expect(generarVeredicto().length).toBeGreaterThan(10);
  });

  it('no inventa cifras que no vienen en el feed', () => {
    // Sin rating ni ventas no debe aparecer ningún "★" ni conteo.
    const v = generarVeredicto({ descuento: 30 });
    expect(v).not.toContain('★');
    expect(v).not.toMatch(/\bvendidos\b/);
  });
});
