import type { Color, Frame } from "@claude-status/matrix";
import { drawGlyph, type Glyph } from "./glyphs";
import type { Mood } from "./state";

// The two edge rows are quota bars, so the face has rows 1 to 6 and the eyes
// sit on 2 to 4.
//
// The eyes sit a row down from the top on purpose. Looking up shifts them by one,
// and from row 1 that puts pixels on row 0 - where two lit corners read as stray
// debris rather than as part of a face.
//
// Eyes are top-aligned rather than centred. Hung off the middle they sit visibly
// low, because the two bars are not part of the face but the eye still reads the
// panel's centre as its own.
const FACE_ROW = 2;

// One motif: the cross, and halves of it. No hollow diamonds - an outlined
// diamond reads as a round eye, which is the opposite of the point.
//
// Five shapes cover seven moods, and that is deliberate. The status already has
// its own colour, so the eyes only have to carry how the session *feels* - awake,
// content, drooping, cross, or done for. Splitting further would mean shapes that
// differ by one pixel and say nothing.
const EYES: Record<Mood, Glyph> = {
  // Up arrows. Read as cute, so they go on the contented states.
  happy: [".#....#.", "#.#..#.#"],
  // The same, a row lower - settled rather than perky.
  zen: ["........", ".#....#.", "#.#..#.#"],
  // Full crosses for the working states. Focused and excited share them: the
  // status has its own colour, so the eyes only have to say awake.
  focused: ["#.#..#.#", ".#....#.", "#.#..#.#"],
  excited: ["#.#..#.#", ".#....#.", "#.#..#.#"],
  // A flat lid with the pupil under it - half shut. Not the top half of a cross,
  // which is a scowl, and not one pixel, which is a fault light.
  tired: ["###..###", ".#....#."],
  // Arrows turned in on each other. These read as angry, which is the one place
  // that is wanted.
  //
  // Inset a column from the edges, unlike the rest: its lit pixels are only the
  // arrow tips, so at x=0 and x=7 a sideways glance clipped one arrow away
  // entirely rather than trimming an edge off it.
  annoyed: [".#....#.", "..#..#..", ".#....#."],
  // Both arrows the same way. It reads as dazed where annoyed's `> <` reads as
  // cross, and the two cannot be confused because no other mood turns both eyes
  // in one direction.
  //
  // This was one single-pixel cross over the whole face. At eight by eight that
  // is not a face giving out, it is a full screen X - which reads as an error
  // the panel is reporting rather than as the pet running out of head. Inset
  // from the edges for the same reason annoyed is.
  dead: [".#...#..", "..#...#.", ".#...#.."],
};

// A blink is an eye almost closed, so it gets its own shape rather than borrowing
// a mood's. Flat lids - a bigger, softer thing than what they replace, so a blink
// does not read as the face dropping out for a frame.
const LID: Glyph = ["........", "###..###"];

// The right eye replaced by a lid, the left left alone. Built from whatever the
// mood's eyes are rather than being its own sprite, so a wink works on every face
// and stays in step if the shapes change.
const winking = (eyes: Glyph): Glyph =>
  eyes.map((row, i) => row.slice(0, 4) + (i === eyes.length - 1 ? ".###" : "...."));

export type FaceOptions = {
  /** Overrides the mood's eyes with a lid, for a blink. */
  blink?: boolean;
  /**
   * Where the eyes are looking, as a pixel offset. Any of the eight directions
   * and centre - a glance rather than the whole head turning.
   */
  gaze?: readonly [number, number];
  /** Shifts the whole face, for a bob. */
  bob?: number;
  /** Shuts one eye. */
  wink?: boolean;
};

export const drawFace = (
  frame: Frame,
  mood: Mood,
  color: Color,
  { blink = false, gaze = [0, 0], bob = 0, wink = false }: FaceOptions = {},
) => {
  // Dead is the one mood with no business looking around.
  const [dx, dy] = mood === "dead" && !blink ? [0, 0] : gaze;

  const eyes = blink ? LID : EYES[mood];

  drawGlyph(frame, wink ? winking(eyes) : eyes, color, dx, FACE_ROW + bob + dy);
};
