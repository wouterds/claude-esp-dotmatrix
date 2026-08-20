import type { Color, Frame } from "@claude-status/matrix";
import { scale } from "@claude-status/matrix";
import { drawGlyph, type Glyph } from "./glyphs";
import { BLUSH } from "./palette";
import type { Mood } from "./state";

// Row 0 is the session window and row 7 the context gauge, so the face has rows
// 1 to 6: eyes from the top, cheeks on 4, a dash of a mouth on 5 and 6.
//
// Eyes are top-aligned rather than centred. Hung off the middle they sit visibly
// low, because the two bars are not part of the face but the eye still reads the
// panel's centre as its own.
const FACE_ROW = 1;
const CHEEK_ROW = 4;
const MOUTH_ROW = 5;
const CHEEKS = [0, 7];

// One motif: the cross, and halves of it. No hollow diamonds - an outlined
// diamond reads as a round eye, which is the opposite of the point.
//
// Five shapes cover seven moods, and that is deliberate. The status already has
// its own colour, so the eyes only have to carry how the session *feels* - awake,
// content, drooping, cross, or done for. Splitting further would mean shapes that
// differ by one pixel and say nothing.
const EYES: Record<Mood, Glyph> = {
  // Full crosses. Wide awake, locked on.
  excited: ["#.#..#.#", ".#....#.", "#.#..#.#"],
  focused: ["#.#..#.#", ".#....#.", "#.#..#.#"],
  // The bottom half - two carets. Shut, and pleased about it.
  happy: ["........", ".#....#.", "#.#..#.#"],
  zen: ["........", ".#....#.", "#.#..#.#"],
  // The top half - two v's, drooping.
  tired: ["#.#..#.#", ".#....#."],
  // A brow slanting inwards over a cross.
  annoyed: ["#......#", "#.#..#.#", ".#....#."],
  // One cross over the whole face rather than one per eye, and no mouth with it.
  dead: ["#......#", ".#....#.", "..#..#..", "..#..#..", ".#....#.", "#......#"],
};

// Two pixels. Dimmer than the eyes, and that is the whole mouth - the mood lives
// in the eyes, so anything wider starts competing with them and anything that
// curves reads as a smiley pasted onto a readout.
const MOUTH: Glyph = ["...##..."];

const MOUTHLESS: readonly Mood[] = ["dead"];
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
  drawGlyph(frame, blink ? EYES.tired : EYES[mood], color, glance, FACE_ROW + bob);

  if (!MOUTHLESS.includes(mood)) {
    drawGlyph(frame, MOUTH, scale(color, 0.55), 0, MOUTH_ROW + bob);
  }

  // Pink rather than the status colour, because a cheek that changes colour with
  // what the session is doing stops reading as a cheek.
  if (!BLUSHING.includes(mood)) return;

  for (const x of CHEEKS) {
    frame.add(x, CHEEK_ROW + bob, BLUSH);
  }
};
