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
  it("keeps the top and bottom rows clear for the two bars, in every mood", () => {
    for (const mood of MOODS) {
      const frame = createFrame();
      drawFace(frame, mood, white);

      expect(litRows(frame), mood).not.toContain(0);
      expect(litRows(frame), mood).not.toContain(7);
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

  it("gives the moods that blush two cheeks and the others none", () => {
    const blushing = createFrame();
    const plain = createFrame();
    drawFace(blushing, "happy", white);
    drawFace(plain, "focused", white);

    expect(blushing.get(0, 4)).not.toEqual([0, 0, 0]);
    expect(plain.get(0, 4)).toEqual([0, 0, 0]);
  });

  it("a glance moves the eyes sideways and leaves the mouth put", () => {
    const ahead = createFrame();
    const aside = createFrame();
    drawFace(ahead, "happy", white);
    drawFace(aside, "happy", white, { glance: 1 });

    expect(aside.get(2, 2)).toEqual(ahead.get(1, 2));
    expect(aside.get(2, 6)).toEqual(ahead.get(2, 6));
  });
});
