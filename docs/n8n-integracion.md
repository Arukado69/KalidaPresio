# Integración n8n → KalidaPresio Web

> Guía operativa para conectar el flujo de automatización de n8n
> con el build estático de KalidaPresio.

---

## Arquitectura de conexión

```
n8n (flujo existente)                              KalidaPresio (Astro SSG)
┌────────────────────────┐                         ┌───────────────────────┐
│ Schedule Trigger       │                         │                       │
│ Descargar HTML ML      │                         │ src/data/             │
│ Extraer Datos Base     │                         │   productos.json ◄────┤
│ Calcular Score v2.0 ───┼──┐                      │                       │
│   │                    │  │                      │ npm run build         │
│   ├─→ Anti-Spam        │  │  ┌──────────────┐   │   → generadorRedirects│
│   │   → Gemini → FB    │  └─→│Formatear Web │   │   → astro build      │
│   │   → Notion         │     │Escribir JSON │──→│   → dist/            │
│   │                    │     └──────────────┘   └───────────────────────┘
└────────────────────────┘
```

La bifurcación sale de `Calcular Score KalidaPresio` en paralelo al flujo Anti-Spam.
Ambas ramas se ejecutan simultáneamente.

---

## Nodo 1: Calcular Score KalidaPresio (REEMPLAZAR código existente)

**Tipo:** Code  
**Modo:** Run Once for All Items

```javascript
// ============================================================
// KALIDA PRESIO — Motor de Scoring v2.0
// Filosofía: La voz del consumidor es el único juez.
// El descuento es una mecánica de ML, no una señal de calidad.
// ============================================================

const PRECIO_MINIMO   = 200;
const OPINIONES_MINIMAS = 5;
const RATING_MINIMO   = 3.5;

const items = $input.all();

const itemsEvaluados = items.map(item => {
  const data = item.json;

  // ── Filtro guillotina ────────────────────────────────────
  if (!data.precio_actual || data.precio_actual < PRECIO_MINIMO) return null;
  if (!data.rating || data.rating === 0) return null;
  if (data.rating < RATING_MINIMO) return null;
  if (data.opiniones < OPINIONES_MINIMAS) return null;

  // ── Algoritmo de scoring: Voz del Consumidor ─────────────
  //
  // CALIDAD (75%): Rating lineal sobre 5 estrellas.
  //   Un producto con 4.8⭐ es genuinamente mejor que uno con 3.9⭐.
  //
  // VOLUMEN (25%): Masa crítica topada a 500 opiniones.
  //   500 opiniones ya es validación estadística suficiente.
  //   No hay razón para que 5000 aplaste a 600.
  //
  // El descuento NO puntúa. Un precio inflado con 30% de
  // descuento no hace mejor al producto.

  const calidad = (Math.max(0, Math.min(data.rating, 5)) / 5) * 75;
  const volumen = (Math.min(Math.max(0, data.opiniones), 500) / 500) * 25;
  const scoreFinal = Math.round((calidad + volumen) * 10) / 10;

  return {
    json: {
      ...data,
      score_kalidad_presio: scoreFinal,
    }
  };
}).filter(item => item !== null);

// Ordenar por score descendente
const productosOrdenados = itemsEvaluados
  .sort((a, b) => b.json.score_kalidad_presio - a.json.score_kalidad_presio);

return productosOrdenados;
```

---

## Nodo 2: Formatear para Web (NUEVO)

**Tipo:** Code  
**Nombre en canvas:** `Formatear para Web`  
**Conexión:** Output de `Calcular Score KalidaPresio` (segunda salida, en paralelo)  
**Modo:** Run Once for All Items

```javascript
// ============================================================
// Transforma los items del pipeline al schema canónico
// de KalidaPresio (productos.json)
// ============================================================

const MATT_TOOL = $env.ML_MATT_TOOL || '68549198';
const MATT_WORD = $env.ML_MATT_WORD || 'ci20241127172754';

// Helpers
const generarUrlAfiliado = (url) => {
  if (!url) return '';
  const base = url.split('?')[0].split('#')[0];
  return `${base}?matt_tool=${MATT_TOOL}&matt_word=${MATT_WORD}`;
};

const obtenerImagenHD = (thumbnail) => {
  if (!thumbnail) return '';
  const hd = thumbnail.replace(/(-[A-Z])(\.(?:jpg|webp|jpeg))$/i, '-O.webp');
  return hd !== thumbnail ? hd : thumbnail;
};

// Parser de especificaciones desde el título (regex sobre texto)
const parsearSpecs = (titulo) => {
  const t = (titulo || '').toLowerCase();
  const ex = (regex) => { const m = t.match(regex); return m ? (m[1] ?? m[0]) : null; };

  const ramGB = ex(/(\d+)\s*gb\s*(?:ddr[45]x?|lpddr[45]x?|ram)?/i);
  const ram = (() => {
    if (!ramGB) return 'N/A';
    if (t.includes('lpddr5')) return `${ramGB} GB LPDDR5`;
    if (t.includes('ddr5'))   return `${ramGB} GB DDR5`;
    if (t.includes('ddr4'))   return `${ramGB} GB DDR4`;
    return `${ramGB} GB`;
  })();

  const ssdRaw = ex(/(\d+\s*(?:tb|gb))\s*(?:ssd|nvme|m\.2|hdd|emmc)?/i);
  const ssdTipo = t.includes('nvme') ? 'NVMe SSD'
    : t.includes('ssd') ? 'SSD'
    : t.includes('emmc') ? 'eMMC'
    : t.includes('hdd') ? 'HDD' : 'SSD';
  const almacenamiento = ssdRaw
    ? `${ssdRaw.toUpperCase().replace(/\s/g,'')} ${ssdTipo}`
    : 'N/A';

  const cpu = (() => {
    const modelos = [
      [/ryzen\s*9\s*(\w+)/i,'AMD Ryzen 9'], [/ryzen\s*7\s*(\w+)/i,'AMD Ryzen 7'],
      [/ryzen\s*5\s*(\w+)/i,'AMD Ryzen 5'], [/ryzen\s*3\s*(\w+)/i,'AMD Ryzen 3'],
      [/core\s*ultra\s*(\d+)/i,'Intel Core Ultra'],
      [/core\s*i9[-\s](\w+)/i,'Intel Core i9'],[/core\s*i7[-\s](\w+)/i,'Intel Core i7'],
      [/core\s*i5[-\s](\w+)/i,'Intel Core i5'],[/core\s*i3[-\s](\w+)/i,'Intel Core i3'],
    ];
    for (const [regex, marca] of modelos) {
      const m = t.match(regex);
      if (m) return `${marca} ${m[1] ?? ''}`.trim();
    }
    const apple = ex(/(m[1-4](?:\s*(?:pro|max|ultra))?)/i);
    if (apple) return `Apple ${apple.toUpperCase()}`;
    return 'N/A';
  })();

  const gpu = (() => {
    const gpus = [
      ['rtx 4090','NVIDIA RTX 4090'],['rtx 4080','NVIDIA RTX 4080'],
      ['rtx 4070 ti','NVIDIA RTX 4070 Ti'],['rtx 4070','NVIDIA RTX 4070'],
      ['rtx 4060 ti','NVIDIA RTX 4060 Ti'],['rtx 4060','NVIDIA RTX 4060'],
      ['rtx 4050','NVIDIA RTX 4050'],['rtx 3060','NVIDIA RTX 3060'],
      ['rx 7800','AMD RX 7800'],['rx 7700','AMD RX 7700'],
      ['rx 7600','AMD RX 7600'],['rx 6600','AMD RX 6600'],
      ['iris xe','Intel Iris Xe'],
    ];
    for (const [token, label] of gpus) {
      if (t.includes(token)) return label;
    }
    if (t.includes('integrada') || t.includes('integrated')) return 'Gráficos Integrados';
    return 'N/A';
  })();

  const hz      = ex(/(\d{2,3})\s*hz/i);
  const pulgadas = ex(/(\d{1,2}(?:\.\d)?)\s*(?:"|pulgadas?|inch)/i);

  return {
    procesador:        cpu,
    ram_gb:            ram,
    almacenamiento_gb: almacenamiento,
    gpu:               gpu,
    pantalla_hz:       hz ? `${pulgadas ?? 'N/A'}" — ${hz}Hz`
                         : pulgadas ? `${pulgadas}"` : 'N/A',
    sistema_operativo: t.includes('windows 11') ? 'Windows 11'
      : t.includes('windows 10') ? 'Windows 10'
      : (t.includes('macos') || t.includes('mac os')) ? 'macOS'
      : t.includes('chrome os') ? 'Chrome OS' : 'N/A',
    conectividad: (t.includes('wifi 6') || t.includes('wi-fi 6'))
      ? 'Wi-Fi 6, Bluetooth 5'
      : (t.includes('wifi') || t.includes('wi-fi')) ? 'Wi-Fi, Bluetooth' : 'N/A',
    bateria: (() => {
      const wh = ex(/(\d+)\s*wh/i);
      const mah = ex(/(\d+)\s*mah/i);
      return wh ? `${wh} Wh` : mah ? `${mah} mAh` : 'N/A';
    })(),
  };
};

// Generador de sentimiento determinista
const generarSentimiento = (data) => {
  const pros = [], contras = [];
  const { rating = 0, opiniones = 0, descuento = 0 } = data;

  if (rating >= 4.5)
    pros.push(`Altamente valorado: ${rating.toFixed(1)}⭐ en ${opiniones.toLocaleString('es-MX')} reseñas verificadas.`);
  else if (rating >= 4.0)
    pros.push(`Bien evaluado por compradores: ${rating.toFixed(1)}⭐ en Mercado Libre México.`);
  if (data.envio_gratis) pros.push('Envío sin costo disponible.');
  if (descuento >= 20)   pros.push(`Precio con descuento activo: ${descuento}% sobre precio de lista.`);

  if (rating < 4.0 && opiniones >= 10)
    contras.push(`Calificación inferior al promedio (${rating.toFixed(1)}⭐). Revisar reseñas antes de comprar.`);
  if (opiniones < 20 && opiniones > 0)
    contras.push(`Volumen de reseñas reducido (${opiniones}). Evaluar más opciones.`);
  if (!data.envio_gratis)
    contras.push('El costo de envío puede variar según ubicación.');

  if (pros.length === 0)    pros.push('Producto disponible en Mercado Libre México con vendedor registrado.');
  if (contras.length === 0) contras.push('Verifica disponibilidad y precio actual directamente en Mercado Libre.');

  return { pros: pros.slice(0, 4), contras: contras.slice(0, 3) };
};

// Detectar categoría desde el título
const detectarCategoria = (titulo) => {
  const t = (titulo || '').toLowerCase();
  if (t.includes('laptop') || t.includes('notebook') || t.includes('macbook')) return 'Computo';
  if (t.includes('monitor') || t.includes('pantalla')) return 'Monitores';
  if (t.includes('teclado') || t.includes('mouse') || t.includes('ratón') ||
      t.includes('audífono') || t.includes('headset') || t.includes('webcam'))
    return 'Perifericos';
  if (t.includes('rtx') || t.includes('rx 6') || t.includes('rx 7') ||
      t.includes('procesador') || t.includes('ryzen') || t.includes('core i') ||
      t.includes('ssd') || t.includes('ram') || t.includes('memoria') ||
      t.includes('fuente') || t.includes('tarjeta madre'))
    return 'Componentes';
  return 'Computo'; // fallback
};

// ── Transformación principal ──────────────────────────────────
const items = $input.all();

const productosFormateados = items.map(item => {
  const d = item.json;
  const titulo    = d.titulo || d.title || d.nombre || '';
  const precio    = d.precio_actual || d.price || 0;
  const rating    = d.rating || 0;
  const opiniones = d.opiniones || 0;
  const score     = d.score_kalidad_presio || 0;
  const enlace    = generarUrlAfiliado(d.link_afiliado || d.permalink || d.url || '');
  const imagen    = obtenerImagenHD(d.imagen || d.thumbnail || '');
  const categoria = detectarCategoria(titulo);
  const specs     = parsearSpecs(titulo);
  const sentiment = generarSentimiento({ rating, opiniones, descuento: d.descuento, envio_gratis: d.envio_gratis });

  return {
    json: {
      id:                         d.id || '',
      nombre:                     titulo,
      precio_mxn:                 precio,
      enlace_afiliado:            enlace,
      categoria:                  categoria,
      imagen:                     imagen,
      envio_gratis:               d.envio_gratis || false,
      rating:                     Math.round(rating * 10) / 10,
      total_opiniones:            opiniones,
      score_satisfaccion_usuario: score,
      especificaciones:           specs,
      opiniones_sentimiento:      sentiment,
      updated_at:                 new Date().toISOString(),
    }
  };
});

return productosFormateados;
```

---

## Nodo 3: Escribir productos.json (NUEVO)

**Tipo:** Code  
**Nombre en canvas:** `Escribir productos.json`  
**Conexión:** Sale de `Formatear para Web`  
**Modo:** Run Once for All Items

```javascript
// ============================================================
// Escribe todos los productos formateados a productos.json
// en el proyecto local de KalidaPresio.
//
// IMPORTANTE: Ajusta RUTA_PROYECTO a la ruta real en tu máquina.
// ============================================================

const fs   = require('fs');
const path = require('path');

// ── AJUSTAR ESTA RUTA ────────────────────────────────────────
const RUTA_PROYECTO = 'C:/Users/Arukado69/Documents/kalidapresio2.0';
// ────────────────────────────────────────────────────────────

const rutaOutput = path.join(RUTA_PROYECTO, 'src/data/productos.json');

// Recoger todos los items del input
const items = $input.all();
const productos = items.map(item => item.json);

if (productos.length === 0) {
  return [{ json: { status: 'skipped', mensaje: 'Cero productos recibidos. JSON no sobrescrito.' } }];
}

// Ordenar por score descendente antes de escribir
productos.sort((a, b) => b.score_satisfaccion_usuario - a.score_satisfaccion_usuario);

// Escribir el JSON de forma atómica
// (escribe a un temp y luego renombra, para evitar archivos corruptos)
const rutaTemp = rutaOutput + '.tmp';

try {
  fs.writeFileSync(rutaTemp, JSON.stringify(productos, null, 2), 'utf-8');
  fs.renameSync(rutaTemp, rutaOutput);
} catch (err) {
  // Si renameSync falla (distintos volúmenes), fallback a writeFileSync directo
  fs.writeFileSync(rutaOutput, JSON.stringify(productos, null, 2), 'utf-8');
}

const resumen = {
  status:           'success',
  productos_escritos: productos.length,
  ruta:             rutaOutput,
  timestamp:        new Date().toISOString(),
  score_maximo:     productos[0]?.score_satisfaccion_usuario,
  score_minimo:     productos[productos.length - 1]?.score_satisfaccion_usuario,
  por_categoria:    productos.reduce((acc, p) => {
    acc[p.categoria] = (acc[p.categoria] ?? 0) + 1;
    return acc;
  }, {}),
};

console.log('✅ productos.json actualizado:', JSON.stringify(resumen, null, 2));

return [{ json: resumen }];
```

---

## Schema de compatibilidad

El validador del build (`generadorRedirects.js`) exige estos campos obligatorios
por cada producto en `productos.json`:

| Campo | Tipo | Requerido | Fuente n8n |
|-------|------|-----------|------------|
| `id` | string | ✅ | `d.id` |
| `nombre` | string | ✅ | `d.titulo \|\| d.title` |
| `precio_mxn` | number | ✅ | `d.precio_actual` |
| `enlace_afiliado` | string | ✅ | `generarUrlAfiliado()` |
| `categoria` | string | ✅ | `detectarCategoria()` |
| `updated_at` | ISO 8601 | ✅ | `new Date().toISOString()` |
| `especificaciones` | object | ✅ | `parsearSpecs()` |
| `opiniones_sentimiento` | object | ✅ | `generarSentimiento()` |
| `opiniones_sentimiento.pros` | string[] (≥1) | ✅ | Garantizado |
| `opiniones_sentimiento.contras` | string[] (≥1) | ✅ | Garantizado |

> [!IMPORTANT]
> Los campos `imagen`, `envio_gratis`, `rating`, `total_opiniones` y
> `score_satisfaccion_usuario` no son requeridos por el validador pero sí son
> consumidos por los componentes Astro. Si faltan, la UI mostrará valores vacíos.

---

## Conexión en el canvas de n8n

```
Calcular Score KalidaPresio
    │
    ├──→ [flujo existente] Compare Datasets → Limit → Gemini → FB → Notion
    │
    └──→ Formatear para Web → Escribir productos.json
```

Arrastra una segunda conexión desde el output de `Calcular Score KalidaPresio`
hacia `Formatear para Web`. n8n ejecuta ambas ramas en paralelo automáticamente.

---

## Checklist de verificación

1. **Ejecutar flujo** desde el Schedule Trigger (botón "Execute workflow")
2. **Revisar output** de `Escribir productos.json`:
   ```json
   { "status": "success", "productos_escritos": N, ... }
   ```
3. **Verificar JSON** en `src/data/productos.json` — IDs con prefijo `MLM`
4. **Build:** `npm run build` → validador pasa sin errores
5. **Preview:** `npm run dev` → tarjetas con productos reales
6. **Afiliado:** enlaces terminan en `?matt_tool=68549198&matt_word=ci20241127172754`

---

## Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| `Escribir productos.json` falla con permisos | n8n no tiene acceso a la carpeta | Verificar permisos de escritura en `src/data/` |
| `productos.length === 0` | Scoring filtró todo | Bajar `RATING_MINIMO` temporalmente a 3.0 |
| Build falla tras n8n write | Schema incompleto | Verificar que `opiniones_sentimiento.pros[]` y `contras[]` tienen ≥1 elemento |
| Imágenes no cargan | Thumbnail con sufijo incorrecto | `obtenerImagenHD()` ya maneja esto |

---

## Próximo paso: Producción (GitHub + Cloudflare Pages)

Cuando el proyecto esté desplegado, el nodo `Escribir productos.json` se reemplaza
por un nodo `HTTP Request` que hace un commit via la API de GitHub:

```
POST https://api.github.com/repos/{owner}/{repo}/contents/src/data/productos.json
```

Esto dispara un rebuild automático en Cloudflare Pages.
Esa configuración se genera cuando el deploy esté listo.
