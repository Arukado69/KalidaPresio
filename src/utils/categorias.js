/**
 * categorias — Clasificador de categoría en build-time, desde el título.
 * (Movido de index.astro para compartirlo con ImbatiblesGrid; misma lógica.)
 * El feed no trae `categoria`; la derivamos por palabras clave. Degrada a "Otros".
 */

const REGLAS = [
  ['Tecnología', /laptop|computadora|monitor|teclado|mouse|aud[ií]fono|headset|roku|smart tv|pantalla|televisi|ssd|disco|webcam|c[aá]mara web|bocina|echo|alexa|tablet|celular|smartwatch|router|cargador|consola|gpu|tarjeta de video|impresora/],
  ['Cocina', /licuadora|olla|sart[eé]n|parrilla|estufa|cafetera|air ?fryer|freidora|vajilla|cuchillo|recipiente|hermético|hermetico|term[oó]|tazas?/],
  ['Hogar', /colch[oó]n|sill[ao]|mesa|espejo|cortina|l[aá]mpara|organizador|almacenamiento|mueble|sof[aá]|cama|edred[oó]n|s[aá]bana|ventilador|hidrolavadora|aspiradora|escritorio|repisa/],
  ['Belleza', /crema|facial|s[eé]rum|maquillaje|shampoo|skincare|cerave|hidratante|labial|perfume|cuidado de la piel|protector solar/],
  ['Salud y Deporte', /creatina|prote[ií]na|whey|vitamina|suplemento|colágeno|colageno|mancuerna|pesa|fitness|yoga|bicicleta/],
  ['Moda', /pijama|playera|camis[ao]|pantal[oó]n|tenis|zapato|reloj|mochila|uniforme|sudadera|chamarra|vestido|bolsa/],
  ['Herramientas', /taladro|llave de impacto|destornillador|herramienta|sierra|pinza|atornillador|esmeril/],
];

/** Orden preferido de los chips de filtro. */
export const ORDEN_CATEGORIAS = ['Tecnología', 'Hogar', 'Cocina', 'Belleza', 'Salud y Deporte', 'Moda', 'Herramientas', 'Otros'];

/** @param {string} titulo @returns {string} */
export function categorizar(titulo = '') {
  const t = titulo.toLowerCase();
  for (const [cat, re] of REGLAS) if (re.test(t)) return cat;
  return 'Otros';
}
