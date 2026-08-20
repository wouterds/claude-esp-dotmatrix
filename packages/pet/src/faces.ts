import type { Color, Frame } from "@claude-status/matrix";
import { scale } from "@claude-status/matrix";
import { drawGlyph, type Glyph } from "./glyphs";
import { BLUSH } from "./palette";
import type { Mood } from "./state";

// Eyes on rows 0 to 2, cheeks on row 3, mouth on rows 4 to 6, which leaves row 7
// for the gauge. The mouth gets three rows because a curve two pixels thick
// needs them - in two rows a smile comes out as a hairline, which is what made
// the first face read as a readout rather than a face. Splitting them rather than drawing seven whole rows per mood
// is what makes a blink or a glance a substitution instead of another fourteen
// sprites.
const EYE_ROW = 0;
const CHEEK_ROW = 3;
const MOUTH_ROW = 4;

const CHEEKS = [1, 6];

type EyeShape = "wide" | "round" | "closed" | "cross" | "angry";
type MouthShape = "smile" | "grin" | "dot" | "frown";

// Open and closed are told apart by proportion rather than by thickness: an open
// eye is tall and narrow, a closed one wide and flat. Doing it with thickness
// instead means one of the two ends up a single pixel line, which is what makes
// a face on a panel this size read as a readout rather than as a face.
const EYES: Record<EyeShape, Glyph> = {
  wide: [".##..##.", ".##..##.", ".##..##."],
  round: ["........", ".##..##.", ".##..##."],
  closed: ["........", "###..###", "###..###"],
  cross: ["#.#..#.#", ".#....#.", "#.#..#.#"],
  angry: ["##....##", ".##..##.", ".##..##."],
};

// Bowls rather than strokes, so every lit run is two pixels thick in one
// direction or the other. A one pixel curve disappears at this size.
const MOUTHS: Record<MouthShape, Glyph> = {
  smile: [".#....#.", ".######.", "..####.."],
  grin: [".######.", ".######.", "..####.."],
  dot: ["........", "...##...", "...##..."],
  frown: ["..####..", ".######.", ".#....#."],
};

const FACES: Record<Mood, { eyes: EyeShape; mouth: MouthShape; blush: boolean }> = {
  happy: { eyes: "round", mouth: "smile", blush: true },
  focused: { eyes: "round", mouth: "dot", blush: false },
  excited: { eyes: "wide", mouth: "grin", blush: true },
  tired: { eyes: "closed", mouth: "dot", blush: false },
  annoyed: { eyes: "angry", mouth: "frown", blush: false },
  zen: { eyes: "closed", mouth: "smile", blush: true },
  dead: { eyes: "cross", mouth: "dot", blush: false },
};

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
  const face = FACES[mood];
  const eyes = blink ? EYES.closed : EYES[face.eyes];

  drawGlyph(frame, eyes, color, glance, EYE_ROW + bob);

  // Pink rather than the status colour, because a cheek that changes colour with
  // what the session is doing stops reading as a cheek.
  if (face.blush) {
    for (const x of CHEEKS) {
      frame.add(x, CHEEK_ROW + bob, BLUSH);
    }
  }

  // The mouth sits a shade under the eyes so they read as the focal point on a
  // panel where every pixel is the same size.
  drawGlyph(frame, MOUTHS[face.mouth], scale(color, 0.7), 0, MOUTH_ROW + bob);
};
