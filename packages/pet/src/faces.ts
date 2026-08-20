import type { Color, Frame } from "@claude-status/matrix";
import { scale } from "@claude-status/matrix";
import { drawGlyph, type Glyph } from "./glyphs";
import type { Mood } from "./state";

// Every face is eyes on rows 1 to 3 and a mouth on rows 5 and 6, which leaves
// row 7 for the gauge. Splitting them rather than drawing seven whole rows per
// mood is what makes a blink or a glance a substitution instead of another
// fourteen sprites.
const EYE_ROW = 1;
const MOUTH_ROW = 5;

type EyeShape = "open" | "narrow" | "wide" | "closed" | "cross" | "angry";
type MouthShape = "smile" | "grin" | "flat" | "frown" | "open" | "small";

const EYES: Record<EyeShape, Glyph> = {
  open: ["........", ".##..##.", ".##..##."],
  narrow: ["........", "........", ".##..##."],
  wide: [".##..##.", ".##..##.", ".##..##."],
  closed: ["........", "........", "###..###"],
  cross: ["#.#..#.#", ".#....#.", "#.#..#.#"],
  angry: ["##....##", ".##..##.", "........"],
};

const MOUTHS: Record<MouthShape, Glyph> = {
  smile: [".#....#.", "..####.."],
  grin: [".######.", "..####.."],
  flat: ["........", "..####.."],
  frown: ["..####..", ".#....#."],
  open: ["..####..", "..####.."],
  small: ["........", "...##..."],
};

const FACES: Record<Mood, { eyes: EyeShape; mouth: MouthShape }> = {
  happy: { eyes: "open", mouth: "smile" },
  focused: { eyes: "narrow", mouth: "flat" },
  excited: { eyes: "wide", mouth: "grin" },
  tired: { eyes: "narrow", mouth: "small" },
  annoyed: { eyes: "angry", mouth: "frown" },
  zen: { eyes: "closed", mouth: "small" },
  dead: { eyes: "cross", mouth: "flat" },
};

export type FaceOptions = {
  /** Overrides the mood's eyes with a lid, for a blink. */
  blink?: boolean;
  /** Shifts the eyes sideways, for a glance. */
  glance?: number;
};

export const drawFace = (
  frame: Frame,
  mood: Mood,
  color: Color,
  { blink = false, glance = 0 }: FaceOptions = {},
) => {
  const face = FACES[mood];
  const eyes = blink ? EYES.closed : EYES[face.eyes];

  drawGlyph(frame, eyes, color, glance, EYE_ROW);
  // The mouth sits a shade under the eyes so they read as the focal point on a
  // panel where every pixel is the same size.
  drawGlyph(frame, MOUTHS[face.mouth], scale(color, 0.7), 0, MOUTH_ROW);
};
