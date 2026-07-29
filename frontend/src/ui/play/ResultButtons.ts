import type { Game } from '../../game/Game.js';
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
    const { closeSongInfoPopup, closeSheetView, setMode, applyPracticeHandButtons, updateLoopUI, updatePauseBtn } = deps;

    const reset = () => {
      closeSongInfoPopup();
      closeSheetView();
    };

    document.getElementById('btn-play')!.addEventListener('click', () => {
      reset();
      game.setPracticeHand(PracticeHand.Both);
      setMode(false);
      game.retry();
      updateLoopUI();
      updatePauseBtn();
    });

    document.getElementById('btn-retry')!.addEventListener('click', () => {
      reset();
      setMode(game.learningMode);
      game.retry();
      applyPracticeHandButtons();
      updateLoopUI();
      updatePauseBtn();
    });

    document.getElementById('btn-menu')!.addEventListener('click', () => {
      reset();
      game.backToMenu();
    });

    document.getElementById('btn-restart')!.addEventListener('click', () => {
      reset();
      setMode(game.learningMode);
      game.retry();
      applyPracticeHandButtons();
      updateLoopUI();
      updatePauseBtn();
    });
  }
}
