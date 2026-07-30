import { type Game, GameState, LoopDefinitionState } from '../../game/Game.js';
import { SHEET_TOP_OFFSET, Renderer, SHEET_BEATS_VISIBLE } from '../../game/rendering/Renderer.js';
import type { SongNote } from '../../game/NoteManager.js';
import { createLoop } from '../../api/LoopApi.js';
import { setupHoverCursor } from '../play/HoverCursor.js';
import { LoopsPanel } from './LoopsPanel.js';
import { reportError } from '../../utils/helpers.js';

const SHEET_STAFF_LINE_SPACING = 10;
export const BASE_SHEET_HEIGHT = 5 + 4 * SHEET_STAFF_LINE_SPACING + 8 + 4 * SHEET_STAFF_LINE_SPACING + 5;

export interface SheetViewDeps {
  closeSongInfoPopup: () => void;
  setMode: (learning: boolean) => void;
  updateLoopUI: () => void;
}

export class SheetView {
  private game: Game;
  private canvas: HTMLCanvasElement;
  private deps: SheetViewDeps;
  private loopsPanel: LoopsPanel;

  private sheetScreen: HTMLElement;
  private sheetCanvas: HTMLCanvasElement;
  private sheetRenderer: Renderer;
  private sheetOpen = false;
  private sheetCurrentPage = 0;
  private sheetRAF: number | null = null;
  private lastPanelRenderLoopId: number | null = null;

  private sheetPageInfo: HTMLElement;
  private sheetHint: HTMLElement;
  private sheetPrevBtn: HTMLElement;
  private sheetNextBtn: HTMLElement;

  constructor(game: Game, canvas: HTMLCanvasElement, deps: SheetViewDeps) {
    this.game = game;
    this.canvas = canvas;
    this.deps = deps;

    const onLoopsMutated = (opts?: { scrollToEnd?: boolean }) => {
      this.deps.updateLoopUI();

      if (this.sheetOpen) {
        const selectedLoop = this.getSelectedLoopBounds();

        if (selectedLoop) {
          const pageDur = this.pageDuration();
          const targetTime = opts?.scrollToEnd ? selectedLoop.endTime : selectedLoop.startTime;
          this.sheetCurrentPage = Math.max(0, Math.min(
            Math.floor(targetTime / pageDur),
            this.sheetPageCount() - 1,
          ));
        }

        this.renderSheetPage();
      }
    };

    this.loopsPanel = new LoopsPanel(game, {
      setMode: (learning) => this.deps.setMode(learning),
      onMutated: onLoopsMutated,
    });

    const openSheetBtn = document.getElementById('btn-open-sheet')!;
    this.sheetScreen = document.getElementById('sheet-screen')!;
    this.sheetCanvas = document.getElementById('sheet-canvas') as HTMLCanvasElement;
    this.sheetRenderer = new Renderer(this.sheetCanvas);
    this.sheetPrevBtn = document.getElementById('btn-sheet-prev')!;
    this.sheetNextBtn = document.getElementById('btn-sheet-next')!;
    const sheetCloseBtn = document.getElementById('btn-close-sheet')!;
    this.sheetPageInfo = document.getElementById('sheet-page-info')!;
    this.sheetHint = document.getElementById('sheet-hint')!;
    const defineLoopBtn = document.getElementById('btn-define-loop')!;
    const clearLoopBtn = document.getElementById('btn-clear-loop')!;
    const addLoopBtn = document.getElementById('btn-add-loop')! as HTMLButtonElement;

    openSheetBtn.addEventListener('click', () => {
      if (this.game.state === GameState.Playing) this.toggleSheetView();
    });

    sheetCloseBtn.addEventListener('click', () => this.closeSheetView());

    this.sheetPrevBtn.addEventListener('click', () => {
      if (this.sheetCurrentPage > 0) { this.sheetCurrentPage--; this.renderSheetPage(); }
    });

    this.sheetNextBtn.addEventListener('click', () => {
      if (this.sheetCurrentPage < this.sheetPageCount() - 1) { this.sheetCurrentPage++; this.renderSheetPage(); }
    });

    this.sheetCanvas.addEventListener('click', (e) => this.handleCanvasClick(e, this.sheetCanvas, this.sheetRenderer));

    defineLoopBtn.addEventListener('click', () => {
      if (!this.game.learningMode) this.deps.setMode(true);
      const noLoops = this.game.loop.loops.length === 0;

      if (noLoops) this.game.beginLoopDefine();
      this.deps.updateLoopUI();

      if (this.game.state === GameState.Playing) {
        this.openSheetView();
        this.startSheetRAF();
      }
    });

    addLoopBtn.addEventListener('click', () => {
      this.game.beginLoopDefine();
      this.deps.updateLoopUI();
      this.loopsPanel.render();

      if (this.sheetOpen) this.renderSheetPage();
    });

    clearLoopBtn.addEventListener('click', () => {
      if (this.game.loopDefinitionState !== LoopDefinitionState.Off || this.game.loop.hasDraft) {
        this.game.cancelLoopDraft();
      }

      this.deps.updateLoopUI();
      this.loopsPanel.render();

      if (this.sheetOpen) this.renderSheetPage();
    });

    const resizeHandle = document.getElementById('sheet-resize-handle')!;
    let resizing = false;
    let resizeRAF = false;

    resizeHandle.addEventListener('pointerdown', (e) => {
      resizing = true;
      resizeHandle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    window.addEventListener('pointermove', (e) => {
      if (!resizing || resizeRAF) return;

      if (this.game.state !== GameState.Playing) return;
      resizeRAF = true;
      requestAnimationFrame(() => {
        const rect = this.canvas.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const minSheetHeight = BASE_SHEET_HEIGHT * 0.5;
        const maxSheetHeight = this.canvas.height * 0.35;
        const targetHeight = Math.max(minSheetHeight, Math.min(maxSheetHeight, y - SHEET_TOP_OFFSET));
        this.game.renderer.sheetScale = targetHeight / BASE_SHEET_HEIGHT;
        resizeRAF = false;
      });
    });

    window.addEventListener('pointerup', () => { resizing = false; });

    this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e, this.canvas, this.game.renderer));

    document.addEventListener('keydown', (e) => {
      if (this.game.state !== GameState.Playing) return;

      if (e.code === 'KeyR') {
        this.deps.closeSongInfoPopup();
        this.closeSheetView();
        this.game.retry();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!this.sheetOpen) return;

      if (e.code === 'ArrowLeft') {
        e.preventDefault();

        if (this.sheetCurrentPage > 0) { this.sheetCurrentPage--; this.renderSheetPage(); }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();

        if (this.sheetCurrentPage < this.sheetPageCount() - 1) { this.sheetCurrentPage++; this.renderSheetPage(); }
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.closeSheetView();
      }
    });

    this.sheetScreen.addEventListener('click', (e) => {
      if (e.target === this.sheetScreen) this.closeSheetView();
    });

    setupHoverCursor(this.game, this.sheetCanvas, this.sheetRenderer);
  }

  closeSheetView(): void {
    this.sheetOpen = false;
    this.sheetScreen.classList.remove('active');
  }

  private pageDuration(): number { return SHEET_BEATS_VISIBLE * (60 / this.game.songBpm); }

  private sheetPageCount(): number {
    return Math.max(1, Math.ceil(this.game.noteManager.getSongDuration() / this.pageDuration()));
  }

  private getSelectedLoopBounds(): { startTime: number; endTime: number } | undefined {
    if (this.loopsPanel.selectedId === null) return undefined;
    const loop = this.game.loop.loops.find((l) => l.id === this.loopsPanel.selectedId);

    if (!loop) return undefined;

    return { startTime: loop.startTime, endTime: loop.endTime };
  }

  renderSheetPage(): void {
    if (!this.sheetOpen) return;
    const ctx = this.sheetRenderer.ctx;
    ctx.clearRect(0, 0, this.sheetCanvas.width, this.sheetCanvas.height);
    const start = this.sheetCurrentPage * this.pageDuration();
    const end = Math.min(start + this.pageDuration(), this.game.noteManager.getSongDuration());

    const selectedLoop = this.getSelectedLoopBounds();

    this.sheetRenderer.drawSheetMusic(
      this.game.noteManager.trebleNotes,
      this.game.noteManager.bassNotes,
      this.game.currentTime,
      this.game.noteManager.getSongDuration(),
      this.game.loop.snapshot(),
      { start, end },
      this.game.songBpm,
      selectedLoop,
    );

    this.sheetPageInfo.textContent = `${this.sheetCurrentPage + 1} / ${this.sheetPageCount()}`;
    this.sheetPrevBtn.toggleAttribute('disabled', this.sheetCurrentPage <= 0);
    this.sheetNextBtn.toggleAttribute('disabled', this.sheetCurrentPage >= this.sheetPageCount() - 1);

    const phase = this.game.loopDefinitionState;

    if (phase === LoopDefinitionState.Start) {
      this.sheetHint.textContent = 'Click the start note';
    } else if (phase === LoopDefinitionState.End) {
      this.sheetHint.textContent = 'Click the end note';
    } else {
      this.sheetHint.textContent = 'Click a note to resume there';
    }
  }

  private jumpSheetToCurrent(): void {
    const dur = this.game.noteManager.getSongDuration();
    this.sheetCurrentPage = dur <= 0
      ? 0
      : Math.min(Math.floor(this.game.currentTime / this.pageDuration()), this.sheetPageCount() - 1);

    if (this.sheetCurrentPage < 0) this.sheetCurrentPage = 0;
    this.renderSheetPage();
  }

  openSheetView(jumpToCurrent = true): void {
    if (this.sheetOpen) {
      if (jumpToCurrent) this.jumpSheetToCurrent();
      else this.renderSheetPage();
      this.loopsPanel.render();

      return;
    }

    this.sheetOpen = true;
    const cur = this.game.loop.current;
    this.loopsPanel.select(cur ? cur.id : null);
    this.sheetScreen.classList.add('active');
    this.sheetRenderer.resize();
    this.sheetRenderer.sheetScale = Math.max(this.sheetRenderer.sheetScale, 1.5);
    this.loopsPanel.render();

    if (jumpToCurrent) this.jumpSheetToCurrent();
    else this.renderSheetPage();
  }

  toggleSheetView(): void {
    if (this.sheetOpen) this.closeSheetView();
    else this.openSheetView();
  }

  private noteFromClick(
    rect: DOMRect, clientX: number, clientY: number,
    renderer: Renderer, maxRadius = 30,
  ): SongNote | null {
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const r = renderer;

    if (r.sheetBarW <= 0) return null;

    if (x < r.sheetBarX - maxRadius || x > r.sheetBarX + r.sheetBarW + maxRadius) return null;
    const note = this.game.noteManager.findNearestNoteByClick(x, y, r, maxRadius);

    if (note) return note;
    const t = r.sheetViewStart
      + ((x - r.sheetBarX) / r.sheetBarW) * (r.sheetViewEnd - r.sheetViewStart);
    let staff: 'treble' | 'bass' | undefined;

    if (y >= r.sheetTrebleTop && y <= r.sheetTrebleBottom) staff = 'treble';
    else if (y >= r.sheetBassTop && y <= r.sheetBassBottom) staff = 'bass';

    return this.game.noteManager.findNearestNote(t, staff);
  }

  private async handleCanvasClick(e: MouseEvent, targetCanvas: HTMLCanvasElement, renderer: Renderer): Promise<void> {
    if (this.game.state !== GameState.Playing) return;

    const inLoopDefine
      = this.game.loopDefinitionState === LoopDefinitionState.Start
      || this.game.loopDefinitionState === LoopDefinitionState.End;

    const note = this.noteFromClick(
      targetCanvas.getBoundingClientRect(), e.clientX, e.clientY,
      renderer, inLoopDefine ? 50 : 30,
    );

    if (!note) return;

    if (inLoopDefine) {
      const newState = this.game.setLoopBoundary(note.time);
      this.deps.updateLoopUI();
      this.loopsPanel.render();

      if (targetCanvas === this.sheetCanvas) this.renderSheetPage();

      if (newState === LoopDefinitionState.Off && this.game.loop.hasDraft) {
        const song = this.game.song;

        if (!song || song.id === undefined) return;
        const ds = this.game.loop.draftStart!;
        const de = this.game.loop.draftEnd!;

        try {
          const created = await createLoop(song.id, ds, de, true);
          this.game.cancelLoopDraft();
          this.game.addSavedLoop(created);

          if (this.game.loopActive && !this.game.learningMode) this.deps.setMode(true);
          this.loopsPanel.render();
          this.deps.updateLoopUI();

          if (this.sheetOpen) this.renderSheetPage();
        } catch (err) {
          reportError('Failed to auto-save loop', err);
        }
      }
    } else {
      this.game.seekTo(note.time);

      if (targetCanvas !== this.canvas) this.closeSheetView();
    }
  }

  private sheetRAFLoop(): void {
    if (!this.sheetOpen || this.game.state !== GameState.Playing) {
      this.closeSheetView();
      this.sheetRAF = null;

      return;
    }

    this.renderSheetPage();

    if (this.lastPanelRenderLoopId !== this.game.loop.currentIndex) {
      this.lastPanelRenderLoopId = this.game.loop.currentIndex;
      this.loopsPanel.render();
    }

    this.sheetRAF = requestAnimationFrame(() => this.sheetRAFLoop());
  }

  private startSheetRAF(): void {
    if (this.sheetRAF === null) this.sheetRAF = requestAnimationFrame(() => this.sheetRAFLoop());
  }
}
