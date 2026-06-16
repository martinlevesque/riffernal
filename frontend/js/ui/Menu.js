export class Menu {
  constructor(songs) {
    this.songs = songs;
    this.selectedSong = null;
    this.onStart = null;
    this.songListEl = document.getElementById('song-list');
    this.startBtn = document.getElementById('btn-start');
    this.menuScreen = document.getElementById('menu-screen');
    this.midiStatusEl = document.getElementById('midi-status');
    this._render();
    this.startBtn.addEventListener('click', () => {
      if (this.selectedSong && this.onStart) {
        this.onStart(this.selectedSong);
      }
    });
  }

  _render() {
    this.songListEl.innerHTML = '';
    for (const song of this.songs) {
      const el = document.createElement('div');
      el.className = 'song-item';
      el.innerHTML = `
        <div class="song-title">${song.title}</div>
        <div class="song-artist">${song.artist}</div>
        <span class="song-difficulty difficulty-${song.difficulty}">${song.difficulty}</span>
      `;
      el.addEventListener('click', () => {
        this.selectedSong = song;
        this.songListEl.querySelectorAll('.song-item').forEach(s => s.classList.remove('selected'));
        el.classList.add('selected');
        this.startBtn.disabled = false;
      });
      this.songListEl.appendChild(el);
    }
    if (this.songs.length > 0) {
      this.selectedSong = this.songs[0];
      this.songListEl.children[0].classList.add('selected');
    }
  }

  show() {
    this.menuScreen.classList.add('active');
  }

  hide() {
    this.menuScreen.classList.remove('active');
  }

  setMidiStatus(connected, message) {
    this.midiStatusEl.textContent = message;
    this.midiStatusEl.className = 'midi-status' + (connected ? ' connected' : '');
  }
}
