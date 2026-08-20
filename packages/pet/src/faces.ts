import type { Color, Frame } from "@claude-status/matrix";
import { scale } from "@claude-status/matrix";
import { drawGlyph, type Glyph } from "./glyphs";
import type { Mood } from "./state";

// Row 7 is the context gauge, so the face has rows 0 to 6: eyes from the top and
// a two pixel mouth below them.
//
// Eyes are top-aligned rather than centred. Hung off the middle they sit visibly
// low, because the two bars are not part of the face but the eye still reads the
// panel's centre as its own.
const FACE_ROW = 1;
const MOUTH_ROW = 5;

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

export type FaceOptions = {
  /** Overrides the mood's eyes with a lid, for a blink. */
  blink?: boolean;
  /**
   * Where the eyes are looking, as a pixel offset. Any of the eight directions
   * and centre; the mouth stays put, which is what makes it read as a glance
   * rather than as the whole head turning.
   */
  gaze?: readonly [number, number];
  /** Shifts the whole face, for a bob. */
  bob?: number;
};

export const drawFace = (
  frame: Frame,
  mood: Mood,
  color: Color,
  { blink = false, gaze = [0, 0], bob = 0 }: FaceOptions = {},
) => {
  drawGlyph(frame, blink ? EYES.tired : EYES[mood], color, gaze[0], FACE_ROW + bob + gaze[1]);

  // Drawn after the eyes and never moved, so however far they look the mouth is
  // untouched. They do cross into its two columns, but rows apart from it.
  if (!MOUTHLESS.includes(mood)) {
    drawGlyph(frame, MOUTH, scale(color, 0.55), 0, MOUTH_ROW + bob);
  }
};
