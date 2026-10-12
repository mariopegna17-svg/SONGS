const $ = selector => document.querySelector(selector);
const audio = $('#audio');
const status = $('#status');
const storageKey = 'songs-player-v2';
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const formatTime = value => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { /* Storage may be unavailable. */ }
let songs = [], selected = -1, queue = [], history = [], shuffleBag = [];
let libraryLoaded = false;
let favorites = new Set(Array.isArray(saved.favorites) ? saved.favorites.filter(value => typeof value === 'string') : []);
let favoritesOnly = false, shuffled = saved.shuffle === true;
let repeat = ['off', 'all', 'one'].includes(saved.repeat) ? saved.repeat : 'off';
let context, source, filters, preamp, limiter;
let eqEnabled = saved.eqEnabled === true;
let bands = ['bass', 'mid', 'treble'].map(name => clamp(saved.bands?.[name], -6, 6));
let sleepDeadline = 0, saveTimestamp = 0, selectionVersion = 0;

function persist() {
  if (!libraryLoaded) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      favorites: [...favorites], volume: audio.volume, muted: audio.muted,
      speed: audio.playbackRate, shuffle: shuffled, repeat,
      eqEnabled, bands: { bass: bands[0], mid: bands[1], treble: bands[2] },
      last: selected >= 0 ? songs[selected].url : null, time: audio.currentTime || 0,
    }));
  } catch { /* Playback remains available without storage. */ }
}

function visibleSongs() {
  const query = normalize($('#search').value.trim());
  return songs.map((song, index) => ({ ...song, index }))
    .filter(song => (!favoritesOnly || favorites.has(song.url)) && normalize(song.title).includes(query));
}

function renderLibrary() {
  const visible = visibleSongs();
  $('#songs').replaceChildren();
  visible.forEach(song => {
    const row = document.createElement('li');
    row.className = `song-row${song.index === selected ? ' selected' : ''}`;
    row.dataset.index = song.index;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'song-button';
    button.setAttribute('aria-label', `Reproducir ${song.title}`);
    button.setAttribute('aria-pressed', String(song.index === selected));
    const number = document.createElement('span');
    number.className = 'track-number'; number.textContent = String(song.index + 1).padStart(2, '0');
    const copy = document.createElement('span'); copy.className = 'song-copy';
    const title = document.createElement('span'); title.className = 'song-title'; title.textContent = song.title;
    const subtitle = document.createElement('span'); subtitle.className = 'song-subtitle';
    subtitle.textContent = `${decodeURIComponent(song.url).split('.').pop().toUpperCase()} · Tu colección`;
    copy.append(title, subtitle); button.append(number, copy);
    button.addEventListener('click', () => {
      startQueue(visible.map(item => item.index), song.index);
    });
    const favorite = document.createElement('button');
    favorite.type = 'button'; favorite.className = 'icon-button favorite';
    const liked = favorites.has(song.url);
    favorite.innerHTML = icon('heart');
    favorite.setAttribute('aria-label', `${liked ? 'Quitar de' : 'Añadir a'} favoritas: ${song.title}`);
    favorite.setAttribute('aria-pressed', String(liked));
    favorite.addEventListener('click', () => toggleFavorite(song.index));
    row.append(button, favorite); $('#songs').append(row);
  });
  $('#all-count').textContent = songs.length;
  $('#favorites-count').textContent = songs.filter(song => favorites.has(song.url)).length;
  $('#count').textContent = `${visible.length} ${visible.length === 1 ? 'canción' : 'canciones'}`;
  $('#play-all').disabled = !visible.length;
  $('#empty').hidden = visible.length > 0;
  $('#empty').textContent = !songs.length
    ? 'Añade tus archivos a la carpeta canciones y vuelve a desplegar la app.'
    : $('#search').value.trim() ? 'No hay canciones que coincidan con tu búsqueda.'
      : 'Guarda tus canciones favoritas pulsando el corazón.';
  $('#all-tab').setAttribute('aria-pressed', String(!favoritesOnly));
  $('#favorites-tab').setAttribute('aria-pressed', String(favoritesOnly));
}

function toggleFavorite(index) {
  const url = songs[index]?.url;
  if (!url) return;
  if (favorites.has(url)) favorites.delete(url); else favorites.add(url);
  persist(); renderLibrary(); updateCurrentFavorite();
}

function updateCurrentFavorite() {
  const song = songs[selected];
  const liked = song && favorites.has(song.url);
  $('#current-favorite').disabled = !song;
  $('#current-favorite').setAttribute('aria-pressed', String(Boolean(liked)));
  $('#current-favorite').setAttribute('aria-label', liked ? 'Quitar canción actual de favoritas' : 'Añadir canción actual a favoritas');
}

function updateModes() {
  $('#shuffle').setAttribute('aria-pressed', String(shuffled));
  const labels = { off: 'Repetición desactivada', all: 'Repetir lista', one: 'Repetir canción' };
  $('#repeat').setAttribute('aria-label', labels[repeat]);
  $('#repeat').title = labels[repeat];
  $('#repeat').setAttribute('aria-pressed', String(repeat !== 'off'));
  $('#repeat-one').hidden = repeat !== 'one';
  updateTransport();
}

function updateTransport() {
  const valid = selected >= 0;
  const position = queue.indexOf(selected);
  $('#play').disabled = !valid;
  $('#shuffle').disabled = !valid;
  $('#repeat').disabled = !valid;
  $('#previous').disabled = !valid;
  $('#next').disabled = !valid || (shuffled
    ? !shuffleBag.length && repeat !== 'all'
    : position >= queue.length - 1 && repeat !== 'all');
}

function updatePlayback() {
  const playing = !audio.paused && !audio.ended;
  document.body.classList.toggle('is-playing', playing);
  $('#play').innerHTML = icon(playing ? 'pause' : 'play');
  $('#play').setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
  $('#play-state').textContent = playing ? 'REPRODUCIENDO' : 'EN PAUSA';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}

function updateTimeline() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  $('#duration').textContent = formatTime(duration);
  $('#elapsed').textContent = formatTime(audio.currentTime);
  $('#seek').disabled = !duration;
  $('#seek').value = duration ? audio.currentTime / duration * 100 : 0;
  $('#seek').setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} de ${formatTime(duration)}`);
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && duration > 0) {
    try { navigator.mediaSession.setPositionState({ duration, playbackRate: audio.playbackRate, position: clamp(audio.currentTime, 0, duration) }); } catch { /* Browser-specific position support. */ }
  }
}

function updateVolume() {
  $('#volume').value = audio.volume;
  const silent = audio.muted || audio.volume === 0;
  $('#volume-value').textContent = `${Math.round((audio.muted ? 0 : audio.volume) * 100)}%`;
  $('#mute').innerHTML = icon(silent ? 'muted' : 'volume');
  $('#mute').setAttribute('aria-pressed', String(silent));
  $('#mute').setAttribute('aria-label', silent ? 'Activar sonido' : 'Silenciar');
}

function startQueue(indices, index) {
  queue = [...indices]; history = []; shuffleBag = queue.filter(item => item !== index);
  select(index, true, false);
}

function select(index, play = true, remember = true, resumeAt = 0) {
  if (!songs[index]) return;
  if (remember && selected >= 0 && selected !== index) history.push(selected);
  selected = index;
  const version = ++selectionVersion;
  audio.src = songs[index].url;
  audio.playbackRate = Number($('#speed').value);
  // Restore only on this selection's metadata, never on a subsequent track.
  const restore = () => {
    audio.removeEventListener('loadedmetadata', restore);
    if (version === selectionVersion && resumeAt > 0 && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - 1));
    }
  };
  if (resumeAt > 0) audio.addEventListener('loadedmetadata', restore);
  $('#current').textContent = songs[index].title;
  $('#track-meta').textContent = `${decodeURIComponent(songs[index].url).split('.').pop().toUpperCase()} · Tu colección personal`;
  document.title = `${songs[index].title} · SONGS`;
  status.textContent = '';
  if ('mediaSession' in navigator && 'MediaMetadata' in window) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: songs[index].title, artist: 'Tu colección', album: 'SONGS' });
  }
  renderLibrary(); updateCurrentFavorite(); updateTimeline(); updateTransport(); persist();
  if (play) playAudio();
}

async function playAudio() {
  if (selected < 0) return;
  const version = selectionVersion;
  if (eqEnabled) await activateEqualizer();
  if (version !== selectionVersion) return;
  // Start the HTML audio element even if optional sound processing is unavailable.
  try {
    await audio.play();
    if (version === selectionVersion) status.textContent = '';
  } catch (error) {
    if (version !== selectionVersion || error.name === 'AbortError') return;
    status.textContent = error.name === 'NotAllowedError'
      ? 'Pulsa play para empezar a escuchar.'
      : 'No se puede reproducir esta canción. Comprueba el archivo de audio.';
  }
}

function togglePlay() { if (audio.paused) playAudio(); else audio.pause(); }

function goNext(automatic = false) {
  if (selected < 0) return;
  if (automatic && repeat === 'one') { audio.currentTime = 0; playAudio(); return; }
  let next;
  if (shuffled) {
    if (!shuffleBag.length && repeat === 'all') shuffleBag = queue.filter(index => index !== selected);
    if (!shuffleBag.length) {
      if (repeat === 'all' && queue.length === 1) { audio.currentTime = 0; playAudio(); }
      return;
    }
    next = shuffleBag.splice(Math.floor(Math.random() * shuffleBag.length), 1)[0];
  } else {
    const position = queue.indexOf(selected);
    next = queue[position + 1];
    if (next === undefined && repeat === 'all') next = queue[0];
  }
  if (next !== undefined) select(next);
}

function goPrevious() {
  if (selected < 0) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (history.length) {
    const previous = history.pop();
    if (shuffled && !shuffleBag.includes(selected)) shuffleBag.push(selected);
    shuffleBag = shuffleBag.filter(index => index !== previous);
    select(previous, true, false);
  } else {
    const previous = queue[queue.indexOf(selected) - 1];
    if (previous !== undefined) select(previous, true, false);
    else if (repeat === 'all') select(queue.at(-1), true, false);
    else audio.currentTime = 0;
  }
}

function seekBy(seconds) {
  if (Number.isFinite(audio.duration)) audio.currentTime = clamp(audio.currentTime + seconds, 0, audio.duration);
}

function updateEqUI() {
  ['bass', 'mid', 'treble'].forEach((name, index) => {
    $(`#${name}`).value = bands[index];
    $(`#${name}-value`).textContent = `${bands[index] > 0 ? '+' : ''}${bands[index]} dB`;
  });
  $('#eq-toggle').setAttribute('aria-pressed', String(eqEnabled));
  $('#eq-toggle').textContent = eqEnabled ? 'Activado' : 'Activar';
}

function connectAudioGraph() {
  if (!source) return;
  source.disconnect();
  if (eqEnabled) {
    source.connect(preamp); preamp.connect(filters[0]);
    filters[0].connect(filters[1]); filters[1].connect(filters[2]);
    filters[2].connect(limiter); limiter.connect(context.destination);
  } else source.connect(context.destination);
}

function applyEqualizer() {
  updateEqUI();
  if (!filters) return;
  filters.forEach((filter, index) => filter.gain.setTargetAtTime(bands[index], context.currentTime, 0.025));
  // Leave headroom for boosted frequencies; the compressor catches peaks.
  const headroom = bands.reduce((sum, gain) => sum + Math.max(0, gain), 0);
  preamp.gain.setTargetAtTime(10 ** (-headroom / 20), context.currentTime, 0.025);
  // A neutral or cut-only profile keeps the recording's dynamics intact.
  limiter.ratio.setTargetAtTime(headroom > 0 ? 20 : 1, context.currentTime, 0.025);
  limiter.threshold.setTargetAtTime(headroom > 0 ? -3 : 0, context.currentTime, 0.025);
}

async function activateEqualizer() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('unsupported');
    if (!context) {
      context = new AudioContextClass();
      // Confirm that processing can start before routing audio away from native playback.
      await context.resume();
      preamp = context.createGain();
      filters = ['lowshelf', 'peaking', 'highshelf'].map((type, index) => {
        const filter = context.createBiquadFilter(); filter.type = type;
        filter.frequency.value = [180, 1200, 5500][index]; filter.Q.value = 0.7;
        return filter;
      });
      limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -3; limiter.knee.value = 3; limiter.ratio.value = 20;
      limiter.attack.value = 0.003; limiter.release.value = 0.15;
      source = context.createMediaElementSource(audio);
      connectAudioGraph();
    }
    if (context.state !== 'running') await context.resume();
    applyEqualizer();
    $('#eq-status').textContent = 'Ecualizador activo. Ajusta el sonido a tu gusto.';
    return true;
  } catch {
    eqEnabled = false;
    if (source) connectAudioGraph();
    updateEqUI(); persist();
    $('#eq-status').textContent = 'El ecualizador no está disponible en este navegador. Puedes escuchar el audio original.';
    return false;
  }
}

$('#play').addEventListener('click', togglePlay);
$('#previous').addEventListener('click', goPrevious);
$('#next').addEventListener('click', () => goNext());
$('#shuffle').addEventListener('click', () => {
  shuffled = !shuffled; shuffleBag = queue.filter(index => index !== selected);
  updateModes(); persist();
});
$('#repeat').addEventListener('click', () => {
  repeat = { off: 'all', all: 'one', one: 'off' }[repeat]; updateModes(); persist();
});
$('#play-all').addEventListener('click', () => {
  const indices = visibleSongs().map(song => song.index);
  if (indices.length) startQueue(indices, shuffled ? indices[Math.floor(Math.random() * indices.length)] : indices[0]);
});
$('#search').addEventListener('input', renderLibrary);
$('#all-tab').addEventListener('click', () => { favoritesOnly = false; renderLibrary(); });
$('#favorites-tab').addEventListener('click', () => { favoritesOnly = true; renderLibrary(); });
$('#current-favorite').addEventListener('click', () => toggleFavorite(selected));
$('#seek').addEventListener('input', () => {
  if (Number.isFinite(audio.duration)) audio.currentTime = Number($('#seek').value) / 100 * audio.duration;
});
$('#volume').addEventListener('input', () => { audio.volume = Number($('#volume').value); audio.muted = false; });
$('#mute').addEventListener('click', () => {
  if (audio.volume === 0) audio.volume = 0.8;
  else audio.muted = !audio.muted;
});
$('#speed').addEventListener('change', () => { audio.playbackRate = Number($('#speed').value); updateTimeline(); persist(); });
$('#eq-toggle').addEventListener('click', async () => {
  eqEnabled = !eqEnabled;
  if (eqEnabled) {
    // Rebuild connections only on toggle, never on each play event.
    if (source) {
      preamp.disconnect(); filters.forEach(filter => filter.disconnect()); limiter.disconnect();
      connectAudioGraph();
    }
    await activateEqualizer();
  } else {
    if (source) {
      preamp.disconnect(); filters.forEach(filter => filter.disconnect()); limiter.disconnect();
      connectAudioGraph();
    }
    $('#eq-status').textContent = 'Sonido original. Ecualizador desactivado.';
  }
  updateEqUI(); persist();
});
$('#preset').addEventListener('change', () => {
  const presets = { flat: [0, 0, 0], bass: [4, 0, 0], voice: [-2, 3, 1], bright: [0, 0, 3] };
  const preset = presets[$('#preset').value];
  if (preset) bands = [...preset];
  applyEqualizer(); persist();
});
['bass', 'mid', 'treble'].forEach((name, index) => {
  $(`#${name}`).addEventListener('input', () => {
    bands[index] = Number($(`#${name}`).value); $('#preset').value = 'custom'; applyEqualizer(); persist();
  });
});
$('#sleep').addEventListener('change', () => {
  const minutes = Number($('#sleep').value);
  sleepDeadline = minutes ? Date.now() + minutes * 60000 : 0;
  $('#sleep-status').textContent = minutes ? `La reproducción se pausará en ${minutes} minutos.` : '';
});
function checkSleep() {
  if (sleepDeadline && Date.now() >= sleepDeadline) {
    audio.pause(); sleepDeadline = 0; $('#sleep').value = '0';
    $('#sleep-status').textContent = 'Temporizador terminado. Reproducción pausada.';
  }
}
setInterval(checkSleep, 1000);

for (const event of ['play', 'pause', 'ended']) audio.addEventListener(event, updatePlayback);
audio.addEventListener('playing', () => { status.textContent = ''; });
audio.addEventListener('ended', () => goNext(true));
audio.addEventListener('loadedmetadata', updateTimeline);
audio.addEventListener('durationchange', updateTimeline);
audio.addEventListener('timeupdate', () => {
  updateTimeline(); checkSleep();
  if (Date.now() - saveTimestamp > 5000) { persist(); saveTimestamp = Date.now(); }
});
audio.addEventListener('pause', persist);
audio.addEventListener('seeked', persist);
audio.addEventListener('volumechange', () => { updateVolume(); persist(); });
audio.addEventListener('error', () => {
  status.textContent = 'No se puede reproducir este archivo. Prueba otra canción o comprueba su formato.';
  updatePlayback();
});
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', checkSleep);
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, select, textarea, button, summary, a, [contenteditable]')) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
  if (event.key === 'ArrowRight') { event.preventDefault(); seekBy(5); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); seekBy(-5); }
  if (event.key === '/') { event.preventDefault(); $('#search').focus(); }
});
if ('mediaSession' in navigator) {
  const actions = {
    play: playAudio, pause: () => audio.pause(), previoustrack: goPrevious,
    nexttrack: () => goNext(), seekbackward: details => seekBy(-(details.seekOffset || 10)),
    seekforward: details => seekBy(details.seekOffset || 10),
    seekto: details => { if (Number.isFinite(audio.duration)) audio.currentTime = clamp(details.seekTime, 0, audio.duration); },
  };
  for (const [action, handler] of Object.entries(actions)) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Not all browsers support every action. */ }
  }
}

async function loadSongs() {
  try {
    const response = await fetch('/api/canciones');
    if (!response.ok) throw new Error('library');
    const result = await response.json();
    if (!Array.isArray(result)) throw new Error('library');
    songs = result;
    libraryLoaded = true;
    $('#total').textContent = songs.length;
    favorites = new Set([...favorites].filter(url => songs.some(song => song.url === url)));
    status.textContent = '';
    queue = songs.map((_, index) => index);
    if (songs.length) {
      const last = songs.findIndex(song => song.url === saved.last);
      const index = last < 0 ? 0 : last;
      shuffleBag = queue.filter(item => item !== index);
      select(index, false, false, last >= 0 ? clamp(saved.time, 0, Number.MAX_SAFE_INTEGER) : 0);
    } else renderLibrary();
    updateModes();
  } catch {
    status.textContent = 'No se pudieron cargar las canciones. Recarga la página para intentarlo de nuevo.';
  }
}

audio.volume = saved.volume === undefined ? 0.8 : clamp(saved.volume, 0, 1);
audio.muted = saved.muted === true;
$('#speed').value = ['0.75', '1', '1.25', '1.5'].includes(String(saved.speed)) ? String(saved.speed) : '1';
audio.playbackRate = Number($('#speed').value);
$('#preset').value = bands.every(value => value === 0) ? 'flat' : 'custom';
updateVolume(); updateEqUI(); updateModes();
document.body.classList.add('enhanced');
loadSongs();
