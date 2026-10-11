const audio = document.querySelector('#audio');
const current = document.querySelector('#current');
const status = document.querySelector('#status');
const list = document.querySelector('#songs');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
let songs = [], selected = -1;

function select(index, play = true) {
  if (index < 0 || index >= songs.length) return;
  selected = index;
  audio.src = songs[index].url;
  current.textContent = songs[index].title;
  previous.disabled = index === 0;
  next.disabled = index === songs.length - 1;
  list.querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  status.textContent = '';
  if (play) audio.play().catch(() => { status.textContent = 'Pulsa play para reproducir la canción.'; });
}

previous.addEventListener('click', () => select(selected - 1));
next.addEventListener('click', () => select(selected + 1));
audio.addEventListener('ended', () => { if (selected < songs.length - 1) select(selected + 1); });
audio.addEventListener('error', () => { status.textContent = 'No se puede reproducir este archivo. Prueba con una canción en MP3.'; });

async function loadSongs() {
  try {
    const response = await fetch('/api/canciones');
    if (!response.ok) throw new Error('No se pudo cargar la biblioteca');
    songs = await response.json();
    document.querySelector('#count').textContent = `${songs.length} ${songs.length === 1 ? 'canción' : 'canciones'}`;
    if (!songs.length) {
      status.textContent = 'Todavía no hay canciones. Añade tus archivos a la carpeta canciones y vuelve a desplegar la app.';
      return;
    }
    songs.forEach((song, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = song.title;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => select(index));
      item.append(button);
      list.append(item);
    });
    select(0, false);
  } catch {
    status.textContent = 'No se pudieron cargar las canciones. Recarga la página para intentarlo de nuevo.';
  }
}
loadSongs();
