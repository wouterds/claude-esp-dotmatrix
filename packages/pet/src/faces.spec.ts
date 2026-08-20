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

describe("drawFace", () => {
  it("keeps row 0 and the gauge row clear, in every mood and at every gaze", () => {
    // Including while looking up, which is what used to put two lit pixels on
    // row 0 where they read as stray debris rather than as a face.
    for (const mood of MOODS) {
      for (const gaze of [
        [0, 0],
        [0, -1],
        [0, 1],
        [1, -1],
        [-1, -1],
      ] as const) {
        const frame = createFrame();
        drawFace(frame, mood, white, { gaze });

        expect(litRows(frame), `${mood} gaze=${gaze}`).not.toContain(0);
        expect(litRows(frame), `${mood} gaze=${gaze}`).not.toContain(7);
      }
    }
  });

  it("lights something for every mood", () => {
    for (const mood of MOODS) {
      const frame = createFrame();
      drawFace(frame, mood, white);

      expect(litRows(frame).length, mood).toBeGreaterThan(0);
    }
  });

  it("blinking swaps the eyes for a lid", () => {
    const open = createFrame();
    const blinked = createFrame();
    drawFace(open, "happy", white);
    drawFace(blinked, "happy", white, { blink: true });

    expect(blinked.toBytes()).not.toEqual(open.toBytes());
  });

  it("a gaze moves the eyes and leaves the mouth put", () => {
    const ahead = createFrame();
    const aside = createFrame();
    drawFace(ahead, "focused", white);
    drawFace(aside, "focused", white, { gaze: [1, 0] });

    expect(aside.get(1, 2)).toEqual(ahead.get(0, 2));
    expect(aside.get(3, 6)).toEqual(ahead.get(3, 6));
  });

  it("looks up and down as well as sideways", () => {
    const ahead = createFrame();
    const up = createFrame();
    drawFace(ahead, "focused", white);
    drawFace(up, "focused", white, { gaze: [0, -1] });

    expect(up.get(0, 1)).toEqual(ahead.get(0, 2));
  });

  it("never lets a gaze disturb the mouth itself", () => {
    // A sideways look does cross into the mouth's two columns - what keeps them
    // apart is the rows, not the columns, which is worth pinning down because the
    // eye shapes have blank centres and it looks like they never could.
    const still = createFrame();
    drawFace(still, "focused", white);

    for (const gaze of [
      [1, 0],
      [-1, 0],
      [1, 1],
      [-1, 1],
      [0, -1],
    ] as const) {
      const frame = createFrame();
      drawFace(frame, "focused", white, { gaze });

      for (const x of [3, 4]) {
        expect(frame.get(x, 6), `mouth at x=${x}, gaze=${gaze}`).toEqual(still.get(x, 6));
      }
    }
  });
});
