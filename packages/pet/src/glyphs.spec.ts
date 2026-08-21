import { createFrame, HEIGHT, WIDTH } from "@claude-status/matrix";
import { describe, expect, it } from "vitest";
import { BOLT, BURST, CHECK, CROSS, drawGlyph, SPARKLE } from "./glyphs";

const ATLAS = { CHECK, CROSS, SPARKLE, BURST, BOLT };

describe("the atlas", () => {
  it("is eight by eight throughout, so nothing is silently clipped", () => {
    // given
    const sprites = Object.entries(ATLAS);

    // when / then - the sweep is the action, so it carries its own assertion
    for (const [name, glyph] of sprites) {
      expect(glyph.length, name).toBe(HEIGHT);

      for (const row of glyph) {
        expect(row.length, name).toBe(WIDTH);
      }
    }
  });

  it("has something lit in every sprite", () => {
    // given
    const sprites = Object.entries(ATLAS);

    // when
    const empty = sprites.filter(([, glyph]) => !glyph.join("").includes("#"));

    // then
    expect(empty.map(([name]) => name)).toEqual([]);
  });
});

describe("drawGlyph", () => {
  it("lights the marked pixels and leaves the rest alone", () => {
    // given
    const frame = createFrame();

    // when
    drawGlyph(frame, ["#.", ".#"], [10, 20, 30]);

    // then
    expect(frame.get(0, 0)).toEqual([10, 20, 30]);
    expect(frame.get(1, 1)).toEqual([10, 20, 30]);
    expect(frame.get(1, 0)).toEqual([0, 0, 0]);
  });

  it("offsets, and clips what the offset pushes off the panel", () => {
    // given
    const frame = createFrame();

    // when
    drawGlyph(frame, ["##"], [1, 2, 3], 7, 0);

    // then
    expect(frame.get(7, 0)).toEqual([1, 2, 3]);
  });
});
