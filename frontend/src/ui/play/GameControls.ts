import { type Game, GameState } from '../../game/Game.js';
import { PracticeHand } from '../../utils/notes.js';
import { fetchUserSettings, updateUserSettings } from '../../api/UserApi.js';
import { themeManager } from '../../themes/ThemeManager.js';

export class GameControls {
  game: Game;

  constructor(game: Game) {
    this.game = game;

    const modePlay = document.getElementById('mode-play')!;
    const modeLearn = document.getElementById('mode-learn')!;
    const handLeft = document.getElementById('hand-left')!;
    const handRight = document.getElementById('hand-right')!;
    const loopPlayBtn = document.getElementById('btn-loop-play')!;
    const pauseBtn = document.getElementById('btn-pause')!;

    modePlay.addEventListener('click', () => this.setMode(false));
    modeLearn.addEventListener('click', () => this.setMode(true));
    loopPlayBtn.addEventListener('click', () => { this.game.loopPlay = !this.game.loopPlay; this.updateLoopUI(); });
    handLeft.addEventListener('click', () => this.setPracticeHand(
      this.game.practiceHand === PracticeHand.Left ? PracticeHand.Both : PracticeHand.Left));
    handRight.addEventListener('click', () => this.setPracticeHand(
      this.game.practiceHand === PracticeHand.Right ? PracticeHand.Both : PracticeHand.Right));
    pauseBtn.addEventListener('click', () => {
      if (this.game.state === GameState.Playing) { this.game.togglePause(); this.updatePauseBtn(); }
    });

    document.addEventListener('keydown', (e) => {
      if (this.game.state !== GameState.Playing) return;

      if (e.code === 'Space') { e.preventDefault(); this.game.togglePause(); this.updatePauseBtn(); }
      else if (e.code === 'KeyN') this.game.seekToNextNote();
    });

    document.getElementById('btn-next-note')!.addEventListener('click', () => {
      if (this.game.state === GameState.Playing) this.game.seekToNextNote();
    });

    // Settings popup
    const settingsPopup = document.getElementById('settings-popup')!;
    document.getElementById('btn-settings')!.addEventListener('click', () => settingsPopup.classList.remove('hidden'));
    document.getElementById('btn-close-settings')!.addEventListener('click', () => settingsPopup.classList.add('hidden'));
    settingsPopup.addEventListener('click', (e) => { if (e.target === settingsPopup) settingsPopup.classList.add('hidden'); });

    // Theme dropdown
    const btnTheme = document.getElementById('btn-theme')!;
    const themeDropdown = document.getElementById('theme-dropdown')!;

    const renderThemeDropdown = () => {
      themeDropdown.innerHTML = '';

      for (const theme of themeManager.availableThemes) {
        const option = document.createElement('button');
        option.className = `theme-option${theme.id === themeManager.current.id ? ' active' : ''}`;
        option.textContent = theme.name;
        option.addEventListener('click', () => {
          themeManager.apply(theme);
          renderThemeDropdown();
          themeDropdown.classList.add('hidden');
        });
        themeDropdown.appendChild(option);
      }
    };

    renderThemeDropdown();

    btnTheme.addEventListener('click', (e) => {
      e.stopPropagation();
      themeDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      themeDropdown.classList.add('hidden');
    });

    // User settings
    this._initUserSettings();
  }

  private async _initUserSettings(): Promise<void> {
    const showUsedKeysCheckbox = document.getElementById('show-used-keys') as HTMLInputElement;
    const octaveAgnosticCheckbox = document.getElementById('octave-agnostic') as HTMLInputElement;

    try {
      const settings = await fetchUserSettings();
      this.game.showUsedKeys = settings.piano_show_used_keys_only ?? false;
      showUsedKeysCheckbox.checked = this.game.showUsedKeys;
      this.game.octaveAgnostic = settings.octave_agnostic ?? false;
      octaveAgnosticCheckbox.checked = this.game.octaveAgnostic;
    } catch { /* ignore */ }

    showUsedKeysCheckbox.addEventListener('change', () => {
      this.game.setShowUsedKeys(showUsedKeysCheckbox.checked);
      updateUserSettings({ piano_show_used_keys_only: showUsedKeysCheckbox.checked })
        .catch((e) => console.warn('Failed to save settings:', e));
    });

    octaveAgnosticCheckbox.addEventListener('change', () => {
      this.game.octaveAgnostic = octaveAgnosticCheckbox.checked;
      updateUserSettings({ octave_agnostic: octaveAgnosticCheckbox.checked })
        .catch((e) => console.warn('Failed to save settings:', e));
    });
  }

  setMode(learning: boolean): void {
    this.game.setLearningMode(learning);
    const modePlay = document.getElementById('mode-play')!;
    const modeLearn = document.getElementById('mode-learn')!;
    const handControl = document.getElementById('hand-control')!;
    modePlay.classList.toggle('active', !learning);
    modeLearn.classList.toggle('active', learning);
    handControl.classList.toggle('active', learning);

    if (!learning && this.game.loopActive) {
      this.game.deactivateLoop();
      this.updateLoopUI();
    }
  }

  setPracticeHand(hand: PracticeHand): void {
    this.game.setPracticeHand(hand);
    this.applyPracticeHandButtons();
  }

  applyPracticeHandButtons(): void {
    const handLeft = document.getElementById('hand-left')!;
    const handRight = document.getElementById('hand-right')!;
    handLeft.classList.toggle('active', this.game.practiceHand === PracticeHand.Left);
    handRight.classList.toggle('active', this.game.practiceHand === PracticeHand.Right);
  }

  updateLoopUI(): void {
    const defineLoopBtn = document.getElementById('btn-define-loop')!;
    const loopStatus = document.getElementById('loop-status')!;
    const loopPlayBtn = document.getElementById('btn-loop-play')!;
    const phase = this.game.loopDefinitionState;
    defineLoopBtn.classList.toggle('active', phase !== 'off');
    defineLoopBtn.classList.toggle('loop-active', this.game.loopActive);

    const enabledCount = this.game.loop.chain.length;
    const savedCount = this.game.loop.loops.length;
    loopPlayBtn.style.display = (this.game.loopActive && this.game.learningMode) ? '' : 'none';
    loopPlayBtn.classList.toggle('play-active', this.game.loopPlay);
    loopPlayBtn.textContent = this.game.loopPlay ? '\u23F8' : '\u25B6';

    if (phase === 'start') loopStatus.textContent = 'Click start note';
    else if (phase === 'end') loopStatus.textContent = 'Click end note';
    else if (this.game.loop.hasDraft) loopStatus.textContent = 'Draft ready — Save in Loops panel';
    else if (this.game.loopActive) {
      const cur = this.game.loop.current;
      loopStatus.textContent = cur
        ? `Loop ${cur.startTime.toFixed(2)}s-${cur.endTime.toFixed(2)}s`
        : 'Chain active';
    } else if (savedCount > 0) {
      loopStatus.textContent = enabledCount > 0
        ? `${enabledCount} of ${savedCount} loops enabled`
        : `${savedCount} loop${savedCount === 1 ? '' : 's'} saved`;
    } else loopStatus.textContent = 'No loops';
  }

  updatePauseBtn(): void {
    const pauseBtn = document.getElementById('btn-pause')!;
    pauseBtn.innerHTML = this.game.paused ? '&#9654;' : '&#9646;&#9646;';
    pauseBtn.title = this.game.paused ? 'Resume (Space)' : 'Pause (Space)';
  }
}
