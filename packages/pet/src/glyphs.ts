import type { Color, Frame } from "@claude-status/matrix";

// Sprites are written as rows of characters rather than hex so a change is
// visible in the diff. `#` lights the pixel and anything else leaves it dark.
export type Glyph = readonly string[];

/** Turned left to right, for a sprite that should face either way. */
export const mirrored = (glyph: Glyph): Glyph => glyph.map((row) => [...row].reverse().join(""));

export const drawGlyph = (frame: Frame, glyph: Glyph, color: Color, dx = 0, dy = 0) => {
  for (let y = 0; y < glyph.length; y++) {
    const row = glyph[y];

    for (let x = 0; x < row.length; x++) {
      if (row[x] === "#") frame.set(x + dx, y + dy, color);
    }
  }
};

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

export const INVADER: Glyph = [
  "..#..#..",
  ".######.",
  "##.##.##",
  "########",
  ".######.",
  "..#..#..",
  ".#....#.",
  "........",
];

// The eyes are a column right of centre, so this ghost is looking somewhere.
// Centred they were symmetric, and a mirrored copy then differed only in the
// skirt - which reads as the hem rippling rather than as the thing turning round.
export const GHOST: Glyph = [
  "..####..",
  ".######.",
  "###.##.#",
  "###.##.#",
  "########",
  "########",
  "#.##.##.",
  "#..#..#.",
];
