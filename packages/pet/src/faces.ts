import type { Color, Frame } from "@claude-status/matrix";
import { drawGlyph, type Glyph } from "./glyphs";
import { BLUSH } from "./palette";
import type { Mood } from "./state";

// No mouth. The eyes carry the whole mood, which is what a face on a panel this
// size can actually do - a mouth here is four or five pixels trying to be a
// curve, and it read as a smiley pasted onto a readout.
//
// Row 0 is the session window and row 7 the context gauge, so the face gets rows
// 1 to 6. Every shape is six rows, blanks included, rather than a patch plus an
// offset: with the whole height to play in, where an eye sits is part of the
// expression.
const FACE_ROW = 1;
const CHEEK_ROW = 6;
const CHEEKS = [1, 6];

// Built from crosses, carets and hollow diamonds - diagonals throughout, no
// rectangles. A 2x2 block reads as a pixel that happens to be on; a cross reads
// as drawn, and the same motif at different sizes and halves covers every mood.
const EYES: Record<Mood, Glyph> = {
  // Hollow diamonds. Open, ordinary.
  happy: ["........", ".#....#.", "#.#..#.#", ".#....#.", "........", "........"],
  // The same, a row taller - wide open.
  excited: [".#....#.", "#.#..#.#", "#.#..#.#", ".#....#.", "........", "........"],
  // Small crosses. Locked on.
  focused: ["........", "........", "#.#..#.#", ".#....#.", "#.#..#.#", "........"],
  // The top half of a cross - two v's, drooping.
  tired: ["........", "........", "#.#..#.#", ".#....#.", "........", "........"],
  // The bottom half - two carets, shut and pleased about it.
  zen: ["........", "........", "........", ".#....#.", "#.#..#.#", "........"],
  // A brow slanting inwards over a cross.
  annoyed: ["#......#", ".#....#.", "#.#..#.#", ".#....#.", "........", "........"],
  // One cross over the whole face rather than one per eye. Unmistakable, and it
  // keeps the motif instead of introducing a shape used nowhere else.
  dead: ["#......#", ".#....#.", "..#..#..", "..#..#..", ".#....#.", "#......#"],
};

const BLUSHING: readonly Mood[] = ["happy", "excited", "zen"];

export type FaceOptions = {
  /** Overrides the mood's eyes with a lid, for a blink. */
  blink?: boolean;
  /** Shifts the eyes sideways, for a glance. */
  glance?: number;
  /** Shifts the whole face vertically, for a bob. */
  bob?: number;
};

export const drawFace = (
  frame: Frame,
  mood: Mood,
  color: Color,
  { blink = false, glance = 0, bob = 0 }: FaceOptions = {},
) => {
  const eyes = blink ? EYES.tired : EYES[mood];

  drawGlyph(frame, eyes, color, glance, FACE_ROW + bob);

  // Pink rather than the status colour, because a cheek that changes colour with
  // what the session is doing stops reading as a cheek.
  if (!BLUSHING.includes(mood)) return;

  for (const x of CHEEKS) {
    frame.add(x, CHEEK_ROW + bob, BLUSH);
  }
};
