import type { Game } from '../../game/Game.js';
import {
  BTN_MENU_ID,
  BTN_PLAY_ID,
  BTN_RESTART_ID,
  BTN_RETRY_ID,
  RESULTS_SCREEN_ID,
} from '../../game/rendering/resultsScreenElementIds.js';
import { PracticeHand } from '../../utils/notes.js';

export interface ResultButtonsDeps {
  closeSongInfoPopup: () => void;
  closeSheetView: () => void;
  setMode: (learning: boolean) => void;
  applyPracticeHandButtons: () => void;
  updateLoopUI: () => void;
  updatePauseBtn: () => void;
}

export class ResultButtons {
  constructor(game: Game, deps: ResultButtonsDeps) {
    const {
      closeSongInfoPopup,
      closeSheetView,
      setMode,
      applyPracticeHandButtons,
      updateLoopUI,
      updatePauseBtn,
    } = deps;

    const reset = () => {
      closeSongInfoPopup();
      closeSheetView();
    };

    const play = () => {
      reset();
      game.setPracticeHand(PracticeHand.Both);
      setMode(false);
      game.retry();
      updateLoopUI();
      updatePauseBtn();
    };

    const retry = () => {
      reset();
      setMode(game.learningMode);
      game.retry();
      applyPracticeHandButtons();
      updateLoopUI();
      updatePauseBtn();
    };

    const menu = () => {
      reset();
      game.backToMenu();
    };

    document.getElementById(BTN_PLAY_ID)!.addEventListener('click', play);
    document.getElementById(BTN_RETRY_ID)!.addEventListener('click', retry);
    document.getElementById(BTN_MENU_ID)!.addEventListener('click', menu);
    document.getElementById(BTN_RESTART_ID)!.addEventListener('click', retry);

    const resultsScreen = document.getElementById(RESULTS_SCREEN_ID)!;

    document.addEventListener('keydown', (e) => {
      if (!resultsScreen.classList.contains('active') || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        game.runResultsAction(e.shiftKey ? 'prev' : 'next');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        game.runResultsAction('enter');
      }
    });
  }
}
