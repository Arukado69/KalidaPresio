const fs = require('fs');
const path = require('path');

// Configuración de rutas e inclusiones
const DIRECTORIO_RAIZ = __dirname;
const ARCHIVO_SALIDA = path.join(DIRECTORIO_RAIZ, 'proyecto_completo_claude.txt');

// Extensiones de archivos de código que queremos que Claude analice
const EXTENSIONES_PERMITIDAS = ['.json', '.css', '.astro', '.js', '.mjs'];

// Carpetas o archivos que debemos ignorar para no saturar el contexto
const IGNORAR = ['node_modules', '.astro', 'dist', 'empaquetar.js', 'package-lock.json', '.git'];

let contenidoTotal = `=== CONTEXTO DEL PROYECTO: KALIDAPRESIO ===\n`;
contenidoTotal += `Dirección raíz: C:\\Users\\Arukado69\\Documents\\kalidapresio2.0\n\n`;

function recorrerDirectorio(dir) {
    const archivos = fs.readdirSync(dir);

    archivos.forEach(archivo => {
        const rutaCompleta = path.join(dir, archivo);
        const stat = fs.statSync(rutaCompleta);
        const nombreRelativo = path.relative(DIRECTORIO_RAIZ, rutaCompleta);

        // Verificar si la carpeta o archivo está en la lista de ignorados
        if (IGNORAR.some(ignorar => nombreRelativo.split(path.sep).includes(ignorar))) {
            return;
        }

        if (stat.isDirectory()) {
            recorrerDirectorio(rutaCompleta);
        } else {
            const ext = path.extname(archivo);
            if (EXTENSIONES_PERMITIDAS.includes(ext)) {
                const contenidoArchivo = fs.readFileSync(rutaCompleta, 'utf-8');
                // Estructuración semántica con etiquetas XML para Claude
                contenidoTotal += `<archivo ruta="${nombreRelativo}">\n`;
                contenidoTotal += contenidoArchivo;
                contenidoTotal += `\n</archivo>\n\n`;
            }
        }
    });
}

console.log('⏳ Iniciando consolidación del proyecto KalidaPresio...');
recorrerDirectorio(DIRECTORIO_RAIZ);

fs.writeFileSync(ARCHIVO_SALIDA, contenidoTotal, 'utf-8');
console.log(`✅ Éxito: Todo el proyecto ha sido consolidado en: ${ARCHIVO_SALIDA}`);