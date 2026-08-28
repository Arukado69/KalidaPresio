/**
 * categorias — Clasificador de categoría en build-time, desde el título.
 * El feed no trae `categoria`: se deriva por palabras clave. Degrada a "Otros".
 *
 * ── PARA QUÉ SIRVE DE VERDAD ───────────────────────────────────────────────
 * No es solo el chip de filtro. La categoría viaja en el `data-cat` de cada
 * tarjeta hasta el evento de Umami, y es la entrada de `detectarNichos.js`, que
 * decide qué nicho aguanta un canal propio. Cada título que cae en "Otros" es
 * una decisión que se toma a ciegas: si el 30 % del feed está sin clasificar,
 * el reparto por nicho no se puede leer.
 *
 * ── EL ORDEN ES LA REGLA, NO LA LISTA ──────────────────────────────────────
 * Gana la PRIMERA regla que coincide, así que el orden de REGLAS resuelve los
 * empates de títulos que mencionan dos mundos. Los tres casos que hay que
 * respetar al tocar esto (hay test para cada uno):
 *
 *   · «Croquetas para Perro … Salmón»  → Mascotas, no Salud (por eso va 1ª)
 *   · «Amplificador de audio PARA AUTO» → Autos, no Tecnología (Autos va antes)
 *   · «Freidora … con pantalla LED»     → Cocina, no Tecnología (Cocina va antes)
 *   · «Tablet … + lápiz óptico»         → Tecnología, no Papelería (va antes)
 *   · «Crema facial con vitamina C»     → Belleza, no Salud (Belleza va antes)
 *
 * `ORDEN_CATEGORIAS` es otra cosa: es el orden de PRESENTACIÓN de los chips.
 * Cambiar uno no cambia el otro, y una categoría nueva tiene que entrar en los
 * dos (el test lo comprueba).
 *
 * ── AL AÑADIR UNA PALABRA CLAVE ────────────────────────────────────────────
 * Que sea específica del producto, no una palabra común del español. `\bpoco\b`
 * (la marca) clasificaría «un poco de ruido» como celular; `usb` mandaría un
 * ventilador USB a Tecnología. Ante la duda, exige contexto: `\d+ c[aá]psulas`
 * en vez de `c[aá]psulas`, que si no se lleva las cápsulas de café.
 */

const REGLAS = [
  // 1º — Mascotas. Antes que Salud: el salmón de las croquetas no es un omega 3.
  ['Mascotas', /croqueta|alimento para (perro|gato)|purina|pedigree|whiskas|dog ?chow|arena para gato|antipulgas|rascador|correa para perro|transportadora para (perro|gato)/],

  // 2º — Autos y Motos, SEÑALES FUERTES. Solo nombres que no significan otra
  // cosa fuera del coche. Ojo con lo que NO está aquí: `\bmoto\b` mandaba el
  // «Celular Moto G15» a autopartes, y `motorola` (Tecnología) nunca llegaba a
  // verse. La pista débil («… para auto») va mucho más abajo, a propósito.
  ['Autos y Motos', /automotriz|autoest[eé]reo|motocicleta|italika|aceite de motor|anticongelante|limpiaparabrisas|bater[ií]a (de|para) (auto|moto|carro)|arrancador de bater[ií]a|\bllantas?\b|amortiguador|balatas?|\brines?\b|scooter|c[aá]mara de reversa|cubreasientos?/],

  // 3º — Bebidas.
  ['Bebidas', /tequila|mezcal|whisk(y|ey)|scotch|cerveza|\brones?\b|vodka|ginebra|\bvinos?\b|licor|brandy|champ[aá][gn]|sidra|co[ñn]ac/],

  // Cocina ANTES que Tecnología: media cocina se anuncia «con pantalla LED», y
  // `pantalla` (que está ahí para los televisores) se llevaba la freidora.
  ['Cocina', /licuadora|\bollas?\b|sart[eé]n|parrilla|estufa|cafetera|air ?fryer|freidora|vajilla|cuchillo|recipiente|hermético|hermetico|term[oó]|tazas?|microondas|escurridor|batidora|tostador|extractor de jugo|procesador de alimentos|refrigerador|\bhorno\b|arrocera|comal|cubiertos|jarra|sandwichera|wafflera|b[aá]scula/],

  // `\btablets?\b` con límites, y la tableta gráfica aparte: sin eso, «30
  // Tabletas» de un medicamento entraba como dispositivo.
  ['Tecnología', /laptop|computadora|monitor|teclado|mouse|aud[ií]fono|airpods|headset|roku|smart tv|pantalla|televisi|ssd|nvme|disco duro|disco|webcam|c[aá]mara web|c[aá]mara (de )?(seguridad|vigilancia)|videovigilancia|bocina|echo|alexa|\btablets?\b|tableta (gr[aá]fica|digitalizadora)|celular|smartphone|dual sim|galaxy|iphone|xiaomi|redmi|motorola|cubot|oppo|realme|smartwatch|router|cargador|power ?bank|bater[ií]a port[aá]til|consola|gpu|tarjeta de video|impresora|multifuncional|esc[aá]ner|proyector|walkie|regulador de voltaje|no ?break|micr[oó]fono|memoria (ram|micro ?sd)/],

  // Papelería DESPUÉS de Tecnología: el «lápiz óptico» de una tablet es una
  // tablet. Y nada de «oficina» a secas, que se llevaría el regulador de
  // voltaje «para hogar y oficina».
  ['Papelería', /cuadernos?|libretas?|plum[oó]n(es)?|crayola|l[aá]pi(z|ces)|bol[ií]grafo|papeler[ií]a|engrapadora|hojas blancas|block de|post-?it|colores de madera|marcatextos/],

  // `\bcamas?\b` con límites: sin ellos, «camara» contiene «cama» y TODA cámara
  // de seguridad terminaba clasificada como Hogar.
  ['Hogar', /colch[oó]n|sill[ao]|\bmesas?\b|espejo|cortina|l[aá]mpara|organizador|almacenamiento|mueble|sof[aá]|\bcamas?\b|edred[oó]n|s[aá]bana|ventilador|hidrolavadora|aspiradora|escritorio|repisa|boiler|calentador de agua|mini ?split|aire acondicionado|(bomba )?presurizadora|carpa|toldo|ganchos? (de |para )?(ropa|terciopelo)|tinaco|regadera|tapete|alfombra|almohada|cobija|cobertor|perchero|cl[oó]set/],

  // 2ª parte de Autos: la pista DÉBIL. «para auto» aparece en montones de
  // productos de casa como caso de uso («aspiradora … para autos»), así que
  // solo se aplica cuando nadie más reclamó el título. Un «amplificador de
  // audio para auto» sí llega hasta aquí, y es lo correcto.
  ['Autos y Motos', /\bpara (auto|carro|camioneta)s?\b/],

  // Belleza ANTES que Salud: «crema con vitamina C» es cosmético, no suplemento.
  ['Belleza', /crema|facial|s[eé]rum|maquillaje|shampoo|skincare|cerave|hidratante|labial|perfume|fragancia|eau de (toilette|parfum)|colonia|cuidado de la piel|protector solar|la roche|anthelios|minoxidil|niacinamida|[aá]cido hialur[oó]nico|r[ií]mel|esmalte|tinte para cabello|depilaci[oó]n|rasuradora|afeitadora|\bbarba\b/],

  // Las presentaciones («90 cápsulas», «30 tabletas») piden número delante: sin
  // él, `cápsulas` se lleva las del café y `tabletas` choca con las tablets.
  ['Salud y Deporte', /creatina|prote[ií]na|whey|vitamina|suplemento|col[aá]geno|mancuerna|\bpesas?\b|fitness|yoga|bicicleta|omega ?3|\d+\s*c[aá]psulas|\d+\s*tabletas?\b|tableta \d+\s*mg|multivitam[ií]nico|magnesio|melatonina|electrolitos/],

  ['Moda', /pijama|playera|camis[ao]|pantal[oó]n|tenis|zapato|\bbotas?\b|reloj|mochila|uniforme|sudadera|chamarra|vestido|bolsa|gorra|cintur[oó]n|calcetines|lentes de sol|sandalias/],

  ['Herramientas', /taladro|llave de impacto|destornillador|herramienta|sierra|pinza|atornillador|esmeril|desbrozador|desmalezadora|podadora|motosierra|soldadora|generador de gasolina|pulidora|rotomartillo/],
];

/**
 * Orden preferido de los chips de filtro. NO es el orden de precedencia
 * (ese es el de REGLAS). "Otros" va siempre al final.
 */
export const ORDEN_CATEGORIAS = [
  'Tecnología', 'Hogar', 'Cocina', 'Belleza', 'Salud y Deporte', 'Moda',
  'Herramientas', 'Autos y Motos', 'Mascotas', 'Papelería', 'Bebidas', 'Otros',
];

/** @param {string} titulo @returns {string} */
export function categorizar(titulo = '') {
  const t = titulo.toLowerCase();
  for (const [cat, re] of REGLAS) if (re.test(t)) return cat;
  return 'Otros';
}
