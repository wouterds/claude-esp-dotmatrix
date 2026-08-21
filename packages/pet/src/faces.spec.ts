import { createFrame, WIDTH } from "@claude-status/matrix";
import { describe, expect, it } from "vitest";
import { drawFace } from "./faces";
import { MOODS } from "./state";

const litRows = (frame: ReturnType<typeof createFrame>) => {
  const rows: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const [r, g, b] = frame.get(x, y);
      if (r || g || b) {
        rows.push(y);
        break;
      }
    }
  }

  return rows;
};

const white = [255, 255, 255] as const;

const GAZES = [
  [0, 0],
  [0, -1],
  [0, 1],
  [1, -1],
  [-1, -1],
] as const;

describe("drawFace", () => {
  it("keeps both quota rows clear, in every mood and at every gaze", () => {
    // given - including while looking up, which is what used to put two lit
    // pixels on row 0 where they read as stray debris rather than as a face.
    const cases = MOODS.flatMap((mood) => GAZES.map((gaze) => ({ mood, gaze })));

    // when / then - the sweep is the action, so it carries its own assertion
    for (const { mood, gaze } of cases) {
      const frame = createFrame();
      drawFace(frame, mood, white, { gaze });

      expect(litRows(frame), `${mood} gaze=${gaze}`).not.toContain(0);
      expect(litRows(frame), `${mood} gaze=${gaze}`).not.toContain(7);
    }
  });

  it("lights something for every mood", () => {
    // given
    const moods = MOODS;

    // when
    const drawn = moods.map((mood) => {
      const frame = createFrame();
      drawFace(frame, mood, white);

      return { mood, rows: litRows(frame).length };
    });

    // then
    for (const { mood, rows } of drawn) {
      expect(rows, mood).toBeGreaterThan(0);
    }
  });

  it("blinking swaps the eyes for a lid", () => {
    // given
    const open = createFrame();
    const blinked = createFrame();

    // when
    drawFace(open, "happy", white);
    drawFace(blinked, "happy", white, { blink: true });

    // then
    expect(blinked.toBytes()).not.toEqual(open.toBytes());
  });

  it("a gaze moves the eyes", () => {
    // given
    const ahead = createFrame();
    const aside = createFrame();

    // when
    drawFace(ahead, "focused", white);
    drawFace(aside, "focused", white, { gaze: [1, 0] });

    // then
    expect(aside.get(1, 2)).toEqual(ahead.get(0, 2));
  });

  it("looks up and down as well as sideways", () => {
    // given
    const ahead = createFrame();
    const up = createFrame();

    // when
    drawFace(ahead, "focused", white);
    drawFace(up, "focused", white, { gaze: [0, -1] });

    // then
    expect(up.get(0, 1)).toEqual(ahead.get(0, 2));
  });
});
