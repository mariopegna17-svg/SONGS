import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const audioTypes = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.opus': 'audio/ogg',
};
const pages = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
};

export function createPlayerServer({ songsDir = path.join(root, 'canciones') } = {}) {
  return http.createServer(async (req, res) => {
    const reply = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return reply(405, 'Método no permitido');
    }
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/api/canciones') {
        const entries = await readdir(songsDir, { withFileTypes: true });
        const songs = entries.filter(entry => entry.isFile() && audioTypes[path.extname(entry.name).toLowerCase()])
          .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
          .map(entry => ({
            title: path.parse(entry.name).name,
            url: `/canciones/${encodeURIComponent(entry.name)}`,
          }));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(songs));
      }
      let filename, contentType, isAudio = false;
      if (pages[pathname]) {
        [filename, contentType] = pages[pathname];
        filename = path.join(root, 'public', filename);
      } else if (pathname.startsWith('/canciones/')) {
        let name;
        try { name = decodeURIComponent(pathname.slice('/canciones/'.length)); }
        catch { return reply(400, 'Nombre de archivo inválido'); }
        if (!name || name.includes('/') || name.includes('\\') || name.includes('\0')) return reply(404, 'No encontrado');
        contentType = audioTypes[path.extname(name).toLowerCase()];
        const entries = await readdir(songsDir, { withFileTypes: true });
        if (!contentType || !entries.some(entry => entry.name === name && entry.isFile())) return reply(404, 'No encontrado');
        filename = path.join(songsDir, name);
        isAudio = true;
      } else {
        return reply(404, 'No encontrado');
      }
      const { size } = await stat(filename);
      const headers = { 'Content-Type': contentType, 'Content-Length': size };
      let start = 0, end = size - 1, status = 200;
      if (isAudio) {
        headers['Accept-Ranges'] = 'bytes';
        if (req.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          if (match && (match[1] || match[2])) {
            start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
            end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
          } else { start = -1; }
          if (start < 0 || start >= size || end < start) {
            res.setHeader('Content-Range', `bytes */${size}`);
            return reply(416, 'Rango inválido');
          }
          status = 206;
          headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
          headers['Content-Length'] = end - start + 1;
        }
      }
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || size === 0) return res.end();
      const stream = createReadStream(filename, { start, end });
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (error.code === 'ENOENT') return reply(404, 'No encontrado');
      console.error('No se pudo atender la petición:', error.message);
      reply(500, 'No se pudo cargar el contenido');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createPlayerServer().listen(port, '0.0.0.0', () => console.log(`Reproductor iniciado en el puerto ${port}`));
}
