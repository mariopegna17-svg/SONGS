# Mis canciones

Reproductor sencillo, sin dependencias externas: lista de canciones, controles de audio, anterior y siguiente. Al terminar una canción pasa a la siguiente.

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
