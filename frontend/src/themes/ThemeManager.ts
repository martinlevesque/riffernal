import type { Theme, ThemeCss } from './types.js';
import { ironTheme } from './iron.js';
import { midnightTheme } from './midnight.js';

const STORAGE_KEY = 'riffernal:theme';

const ALL_THEMES: Theme[] = [ironTheme, midnightTheme];

const CSS_VAR_MAP: Record<keyof ThemeCss, string> = {
  bgDark: '--bg-dark',
  bgSurface: '--bg-surface',
  bgSurface2: '--bg-surface-2',
  bgCard: '--bg-card',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  accentRed: '--accent-red',
  accentOrange: '--accent-orange',
  accentBlue: '--accent-blue',
  accentGreen: '--accent-green',
  accentPurple: '--accent-purple',
  accentYellow: '--accent-yellow',
  borderSubtle: '--border-subtle',
  borderMedium: '--border-medium',
  borderStrong: '--border-strong',
  borderDivider: '--border-divider',
  textOnAccent: '--text-on-accent',
};

const FONT_VAR_MAP: Record<keyof Theme['fonts'], string> = {
  ui: '--font-ui',
  mono: '--font-mono',
};

class ThemeManager {
  private _current: Theme = ironTheme;

  get current(): Theme {
    return this._current;
  }

  get canvas(): Theme['canvas'] {
    return this._current.canvas;
  }

  get fonts(): Theme['fonts'] {
    return this._current.fonts;
  }

  get effects(): Theme['effects'] {
    return this._current.effects;
  }

  get css(): ThemeCss {
    return this._current.css;
  }

  get availableThemes(): readonly Theme[] {
    return ALL_THEMES;
  }

  init(): void {
    const saved = localStorage.getItem(STORAGE_KEY);
    const theme = ALL_THEMES.find((t) => t.id === saved) ?? ironTheme;
    this.apply(theme);
  }

  apply(theme: Theme): void {
    this._current = theme;
    const root = document.documentElement;

    for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
      root.style.setProperty(cssVar, theme.css[key as keyof ThemeCss]);
    }

    for (const [key, cssVar] of Object.entries(FONT_VAR_MAP)) {
      root.style.setProperty(cssVar, theme.fonts[key as keyof Theme['fonts']]);
    }

    root.dataset.theme = theme.id;

    this._toggleEffectClass('has-grain', theme.effects.grainOverlay);
    this._toggleEffectClass('has-scanlines', theme.effects.scanlines);

    localStorage.setItem(STORAGE_KEY, theme.id);
  }

  cycle(): Theme {
    const idx = ALL_THEMES.findIndex((t) => t.id === this._current.id);
    const next = ALL_THEMES[(idx + 1) % ALL_THEMES.length];
    this.apply(next);
    return next;
  }

  private _toggleEffectClass(className: string, enabled: boolean): void {
    document.body.classList.toggle(className, enabled);
  }
}

export const themeManager = new ThemeManager();
