// Rebuilds public/images/logo-{dark,light}.svg. Run: bun run logo
//

import path from "node:path";

// Pixel-for-pixel recreation of the wordmark the home and login pages
// render (.home-title in frontend/css/home.css, .auth-brand in
// frontend/css/auth.css). All coordinates are CSS pixels of an 80px
// render: Press Start 2P advances 8 cells per glyph (cell is
// font-size / 8), the pages add letter-spacing 0.4em (+32px), the
// accent span gets four diagonal ±3px red copies plus a 4px drop
// shadow, and the rest of the word gets a 6px drop shadow — see the
// .home-title .accent rule in frontend/css/pixel.css. The letterform
// bitmaps below were measured from the shipped WOFF2 at that size,
// one probe per cell.

const LETTERS: Record<string, string[]> = {
  R: ["111111", "1100011", "1100011", "1100111", "11111", "110111", "1100111"],
  I: ["0111111", "00011", "00011", "00011", "00011", "00011", "0111111"],
  F: ["1111111", "11", "11", "111111", "11", "11", "11"],
  E: ["1111111", "11", "11", "111111", "11", "11", "1111111"],
  N: ["1100011", "1110011", "1111011", "1101111", "1100111", "1100011", "1100011"],
  A: ["00111", "011011", "1100011", "1100011", "1111111", "1100011", "1100011"],
  L: ["011", "011", "011", "011", "011", "011", "0111111"],
};

const WORD = "RIFFERNAL";
const RED_COUNT = 4; // "RIFF" is the accent span

const FS = 80; // .home-title at html font-size 20px → 4rem
const CELL = FS / 8;
const STEP = FS * 1.4; // glyph advance + letter-spacing 0.4em
const HALO = 3; // .accent diagonal copies
const SHADOW_ACCENT = 4; // var(--pixel-shadow-offset)
const SHADOW_REST = 6; // .home-title text-shadow

const RED = "#ff2244";
const VARIANT_COLORS = {
  dark: { neutral: "#e0e0e0", shadow: "rgba(0,0,0,0.85)" },
  light: { neutral: "#161616", shadow: "rgba(0,0,0,0.85)" },
};

function spanD(from: number, to: number, ox: number, oy: number): string {
  const parts: string[] = [];
  for (let i = from; i < to; i++) {
    const bm = LETTERS[WORD[i]];
    const dx = i * STEP + ox;
    for (let r = 0; r < bm.length; r++) {
      let run = -1;
      for (let c = 0; c <= bm[r].length; c++) {
        if (bm[r][c] === "1" && run < 0) run = c;
        if (bm[r][c] !== "1" && run >= 0) {
          const w = (c - run) * CELL;
          parts.push(`M${dx + run * CELL} ${oy + r * CELL}h${w}v${CELL}h-${w}z`);
          run = -1;
        }
      }
    }
  }
  return parts.join("");
}

function inkExtents(): { minX: number; maxX: number; rows: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let rows = 0;
  for (let i = 0; i < WORD.length; i++) {
    const bm = LETTERS[WORD[i]];
    rows = Math.max(rows, bm.length);
    for (let r = 0; r < bm.length; r++) {
      for (let c = 0; c < bm[r].length; c++) {
        if (bm[r][c] === "1") {
          minX = Math.min(minX, i * STEP + c * CELL);
          maxX = Math.max(maxX, i * STEP + (c + 1) * CELL);
        }
      }
    }
  }
  return { minX, maxX, rows };
}

function svg(variant: "dark" | "light"): string {
  const colors = VARIANT_COLORS[variant];
  const ink = inkExtents();
  const left = ink.minX - HALO;
  const top = -HALO;
  const w = ink.maxX + SHADOW_REST - left;
  const h = ink.rows * CELL + SHADOW_REST + HALO;

  const accent = spanD(0, RED_COUNT, -left, -top);
  const rest = spanD(RED_COUNT, WORD.length, -left, -top);
  const shadow =
    spanD(0, RED_COUNT, -left + SHADOW_ACCENT, -top + SHADOW_ACCENT) +
    spanD(RED_COUNT, WORD.length, -left + SHADOW_REST, -top + SHADOW_REST);

  const layer = (fill: string, d: string) => `  <path fill="${fill}" d="${d}"/>`;
  const markup = [
    layer(colors.shadow, shadow),
    layer(colors.neutral, rest),
    ...[[-HALO, -HALO], [HALO, -HALO], [-HALO, HALO], [HALO, HALO]].map(([dx, dy]) =>
      layer(RED, spanD(0, RED_COUNT, -left + dx, -top + dy)),
    ),
    layer(RED, accent),
  ].join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">
${markup}
</svg>
`;
}

const base = path.resolve(import.meta.dir, "..", "public", "images");
await Bun.write(`${base}/logo-light.svg`, svg("light"));
await Bun.write(`${base}/logo-dark.svg`, svg("dark"));
console.log("wrote public/images/logo-light.svg");
console.log("wrote public/images/logo-dark.svg");
