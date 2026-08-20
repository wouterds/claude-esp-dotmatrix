import type { Color, Frame } from "@claude-status/matrix";

// Sprites are written as rows of characters rather than hex so a change is
// visible in the diff. `#` lights the pixel and anything else leaves it dark.
export type Glyph = readonly string[];

export const drawGlyph = (frame: Frame, glyph: Glyph, color: Color, dx = 0, dy = 0) => {
  for (let y = 0; y < glyph.length; y++) {
    const row = glyph[y];

    for (let x = 0; x < row.length; x++) {
      if (row[x] === "#") frame.set(x + dx, y + dy, color);
    }
  }
};

export const HEART: Glyph = [
  ".##..##.",
  "########",
  "########",
  "########",
  ".######.",
  "..####..",
  "...##...",
  "........",
];

export const CHECK: Glyph = [
  "........",
  "......##",
  ".....##.",
  "....##..",
  "#..##...",
  "##.##...",
  ".###....",
  "..#.....",
];

export const CROSS: Glyph = [
  "##....##",
  "###..###",
  ".######.",
  "..####..",
  "..####..",
  ".######.",
  "###..###",
  "##....##",
];

export const SPARKLE: Glyph = [
  "...##...",
  "...##...",
  "#..##..#",
  "########",
  "########",
  "#..##..#",
  "...##...",
  "...##...",
];

// Claude's mark, as close as eight rays get on a panel this size.
export const BURST: Glyph = [
  "#..##..#",
  ".#.##.#.",
  "..####..",
  "########",
  "########",
  "..####..",
  ".#.##.#.",
  "#..##..#",
];

// Shifted a column right of where it was drawn: the strike runs bottom-left to
// top-right, so at x=0 to 6 it hangs off the left of the panel.
export const BOLT: Glyph = [
  ".....##.",
  "....##..",
  "...##...",
  "..#####.",
  "....##..",
  "...##...",
  "..##....",
  ".#......",
];
