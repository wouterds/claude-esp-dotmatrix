import { createFrame, HEIGHT, WIDTH } from "@claude-status/matrix";
import { describe, expect, it } from "vitest";
import { BOLT, BURST, CHECK, CROSS, drawGlyph, HEART, SPARKLE } from "./glyphs";

const ATLAS = { HEART, CHECK, CROSS, SPARKLE, BURST, BOLT };

describe("the atlas", () => {
  it("is eight by eight throughout, so nothing is silently clipped", () => {
    for (const [name, glyph] of Object.entries(ATLAS)) {
      expect(glyph.length, name).toBe(HEIGHT);

      for (const row of glyph) {
        expect(row.length, name).toBe(WIDTH);
      }
    }
  });

  it("has something lit in every sprite", () => {
    for (const [name, glyph] of Object.entries(ATLAS)) {
      expect(glyph.join("").includes("#"), name).toBe(true);
    }
  });
});

describe("drawGlyph", () => {
  it("lights the marked pixels and leaves the rest alone", () => {
    const frame = createFrame();
    drawGlyph(frame, ["#.", ".#"], [10, 20, 30]);

    expect(frame.get(0, 0)).toEqual([10, 20, 30]);
    expect(frame.get(1, 1)).toEqual([10, 20, 30]);
    expect(frame.get(1, 0)).toEqual([0, 0, 0]);
  });

  it("offsets, and clips what the offset pushes off the panel", () => {
    const frame = createFrame();
    drawGlyph(frame, ["##"], [1, 2, 3], 7, 0);

    expect(frame.get(7, 0)).toEqual([1, 2, 3]);
  });
});
