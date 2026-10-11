import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPlayerServer } from '../server.js';

test('biblioteca, entrega de audio, rangos y rutas restringidas', async t => {
  const songsDir = await mkdtemp(path.join(os.tmpdir(), 'songs-test-'));
  const server = createPlayerServer({ songsDir });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(songsDir, { recursive: true, force: true });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = route => fetch(base + route);

  const empty = await request('/api/canciones');
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), []);
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<audio[^>]*controls/);
  for (const route of ['/app.js', '/styles.css']) assert.equal((await request(route)).status, 200);

  // Valid PCM WAV: a short silent audio sample, kept outside the repository.
  const wav = Buffer.alloc(140);
  wav.write('RIFF'); wav.writeUInt32LE(132, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(96, 40);
  await writeFile(path.join(songsDir, 'Mi canción #1.WAV'), wav);
  await writeFile(path.join(songsDir, 'oculto.txt'), 'no audio');
  await symlink(path.join(songsDir, 'Mi canción #1.WAV'), path.join(songsDir, 'enlace.wav'));
  const songs = await (await request('/api/canciones')).json();
  assert.equal(songs.length, 1);
  assert.equal(songs[0].title, 'Mi canción #1');
  const audio = await request(songs[0].url);
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get('content-type'), 'audio/wav');
  assert.deepEqual(Buffer.from(await audio.arrayBuffer()), wav);

  for (const [range, start, end] of [['bytes=0-43', 0, 43], ['bytes=44-', 44, 139], ['bytes=-10', 130, 139]]) {
    const partial = await fetch(base + songs[0].url, { headers: { Range: range } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), `bytes ${start}-${end}/140`);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), wav.subarray(start, end + 1));
  }
  const head = await fetch(base + songs[0].url, { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), '140');
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const invalid = await fetch(base + songs[0].url, { headers: { Range: 'bytes=999-' } });
  assert.equal(invalid.status, 416);
  for (const route of ['/server.js', '/canciones/oculto.txt', '/canciones/enlace.wav', '/canciones/..%2Fserver.js', '/canciones/no-existe.mp3']) {
    assert.equal((await request(route)).status, 404, route);
  }
  assert.equal((await request('/canciones/%ZZ.mp3')).status, 400);
  assert.equal((await fetch(base + '/api/canciones', { method: 'POST' })).status, 405);
});
