import type { Color, Frame } from "@claude-status/matrix";
import { scale } from "@claude-status/matrix";
import { drawGlyph, type Glyph } from "./glyphs";
import type { Mood } from "./state";

// Row 7 is the context gauge and row 0 is left to the spinner, so the face has
// rows 1 to 6: eyes on 2 to 4 and a two pixel mouth on 6.
//
// The eyes sit a row down from the top on purpose. Looking up shifts them by one,
// and from row 1 that puts pixels on row 0 - where two lit corners read as stray
// debris rather than as part of a face.
//
// Eyes are top-aligned rather than centred. Hung off the middle they sit visibly
// low, because the two bars are not part of the face but the eye still reads the
// panel's centre as its own.
const FACE_ROW = 2;
const MOUTH_ROW = 6;

// Dead is the one shape that needs the whole face, and the one that has no
// business looking around.
const DEAD_ROW = 1;

// One motif: the cross, and halves of it. No hollow diamonds - an outlined
// diamond reads as a round eye, which is the opposite of the point.
//
// Five shapes cover seven moods, and that is deliberate. The status already has
// its own colour, so the eyes only have to carry how the session *feels* - awake,
// content, drooping, cross, or done for. Splitting further would mean shapes that
// differ by one pixel and say nothing.
const EYES: Record<Mood, Glyph> = {
  // Full crosses. Wide awake, locked on.
  // Full crosses. Wide awake.
  excited: ["#.#..#.#", ".#....#.", "#.#..#.#"],
  // Sideways arrows, turned in on each other. Concentrating.
  //
  // Inset a column from the edges, unlike the rest: its lit pixels are only the
  // arrow tips, so at x=0 and x=7 a sideways glance clipped one arrow away
  // entirely rather than trimming an edge off it.
  focused: [".#....#.", "..#..#..", ".#....#."],

  // The bottom half - two carets. Shut, and pleased about it.
  happy: ["........", ".#....#.", "#.#..#.#"],
  zen: ["........", ".#....#.", "#.#..#.#"],
  // Nearly shut: one pixel each. The top half of a cross was the obvious droop and
  // the wrong one - two v's read as a scowl rather than as fatigue.
  //
  // It doubles as the blink, which is what a blink should be anyway: an eye almost
  // closed, not an eye swapped for a different shape.
  tired: [".#....#."],
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
  const dead = mood === "dead" && !blink;
  const row = dead ? DEAD_ROW : FACE_ROW;
  const [dx, dy] = dead ? [0, 0] : gaze;

  drawGlyph(frame, blink ? EYES.tired : EYES[mood], color, dx, row + bob + dy);

  // Drawn after the eyes and never moved, so however far they look the mouth is
  // untouched. They do cross into its two columns, but rows apart from it.
  if (!MOUTHLESS.includes(mood)) {
    drawGlyph(frame, MOUTH, scale(color, 0.55), 0, MOUTH_ROW + bob);
  }
};
