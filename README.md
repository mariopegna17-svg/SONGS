# Mis canciones

Reproductor sin dependencias externas, con diseño oscuro adaptable a móvil y ordenador.

## Funciones

- Biblioteca con búsqueda que reconoce palabras con y sin tildes.
- Play/pausa, anterior/siguiente, barra de progreso, volumen y silencio.
- Favoritas guardadas en el navegador.
- Reproducción aleatoria sin repetir canciones hasta completar la lista; repetición de lista o de una canción.
- El botón Reproducir y la selección de una canción usan como lista las canciones visibles: todas, favoritas o resultados de búsqueda.
- Ecualizador de tres bandas con perfiles Original, Más graves, Voces claras y Más brillo.
- Velocidad de reproducción y temporizador de 15, 30 o 60 minutos.
- Recuperación de última canción y posición, sin reproducción automática al abrir la página.
- Atajos: espacio para play/pausa, flechas para avanzar o retroceder cinco segundos y `/` para buscar cuando el foco no está en un control.
- Controles multimedia del sistema y pantalla de bloqueo cuando el navegador los admite.

Las favoritas, volumen, velocidad y ajustes se guardan solo en ese navegador; no necesitas una cuenta. El temporizador funciona mientras la página permanece abierta; si el navegador suspende la pestaña, se aplica al reanudarla.

## Sonido

El servidor entrega los archivos originales sin convertirlos ni recomprimirlos. En **Ajusta tu sonido**, activa el ecualizador para cambiar graves, medios y agudos. Incluye compensación de ganancia y compresión de picos para reducir la saturación al reforzar frecuencias. Puedes desactivarlo para escuchar el original. Si el navegador no admite Web Audio, sigue disponible la reproducción normal.

Estos ajustes no recuperan detalle perdido de un MP3 ni convierten una grabación en alta resolución. Para aumentar la calidad real, utiliza una fuente de mejor calidad, por ejemplo MP3 de mayor bitrate o FLAC si tu navegador lo admite. En algunos móviles el volumen lo gestiona el sistema.

## Añadir canciones

Pon tus archivos directamente dentro de **`canciones/`**, sin subcarpetas. Se muestran con el nombre del archivo, sin la extensión. Por ejemplo, `canciones/Mi canción.mp3` aparece como «Mi canción».

Se reconocen MP3, WAV, OGG, M4A, AAC, FLAC y OPUS; la reproducción depende del formato compatible con tu navegador. **MP3 es la opción recomendada.** La carpeta incluye un archivo `.gitkeep` para conservarla vacía en Git; puedes dejarlo.

## Ejecutar en tu equipo

Con Node.js 24 instalado, desde la carpeta del proyecto:

```sh
npm ci
npm start
```

Abre `http://localhost:3000`. Para comprobar el servidor: `npm test`.

## Desplegar en Render

1. Sube los archivos de este proyecto y tus canciones a `mariopegna17-svg/SONGS` en GitHub, en la rama `main`.
2. En Render, pulsa **New → Web Service**, conecta GitHub y selecciona el repositorio **SONGS**.
3. Configura el servicio:

   | Campo | Valor |
   | --- | --- |
   | Branch | `main` |
   | Language / Runtime | `Node` |
   | Root Directory | Vacío |
   | Build Command | `npm ci` |
   | Start Command | `npm start` |

4. Elige el plan que prefieras y pulsa **Deploy Web Service**. Cuando termine, abre la URL que te da Render.

No necesita claves, base de datos ni variables de entorno adicionales. El servidor usa automáticamente el puerto `PORT` que proporciona Render. Si eliges un plan gratuito con suspensión por inactividad, el primer acceso puede tardar en arrancar.

Para añadir más canciones, súbelas a `canciones/` en GitHub y guarda el cambio en `main`. Render las incluirá en el siguiente despliegue; si desactivas el despliegue automático, usa **Manual Deploy → Deploy latest commit**.

Este reproductor no tiene una pantalla para subir archivos. Las canciones se incorporan desde el repositorio y no se guardan como subidas temporales en Render.
