export interface ThemeCss {
  bgDark: string;
  bgSurface: string;
  bgSurface2: string;
  bgCard: string;
  textPrimary: string;
  textSecondary: string;
  accentRed: string;
  accentOrange: string;
  accentBlue: string;
  accentGreen: string;
  accentPurple: string;
  accentYellow: string;
  borderSubtle: string;
  borderMedium: string;
  borderStrong: string;
  borderDivider: string;
  textOnAccent: string;
}

export interface ThemeCanvas {
  bg: string;
  highwayBg: string;
  highwayLane: string;
  whiteKeyBg: string;
  whiteKeyBgPressed: string;
  whiteKeyBorder: string;
  blackKeyBg: string;
  blackKeyBgPressed: string;
  blackKeyBorder: string;
  keyIndicatorUnpressed: string;
  keyLabel: string;
  keyLabelPressedWhite: string;
  keyLabelPressedBlack: string;
  noteFallbackColor: string;
  backingNote: string;
  staffLine: string;
  clef: string;
  measureLine: string;
  beatLine: string;
  sheetBorder: string;
  hitNote: string;
  playbackCursor: string;
  loopMarker: string;
  loopOverlayActive: string;
  loopOverlayInactive: string;
  loopDefiningPreview: string;
  failColorLeft: string;
  failColorRight: string;
  failColorSheetLeft: string;
  failColorSheetRight: string;
  failParticleLeft: string;
  failParticleRight: string;
  noteHeadLabel: string;
  noteHighlight: string;
  hitLine: string;
}

export interface ThemeFonts {
  ui: string;
  mono: string;
}

export interface ThemeEffects {
  grainOverlay: boolean;
  /** CRT-style scanline overlay across UI screens. */
  scanlines: boolean;
}

export interface Theme {
  id: string;
  name: string;
  css: ThemeCss;
  canvas: ThemeCanvas;
  fonts: ThemeFonts;
  effects: ThemeEffects;
}
