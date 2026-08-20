import { describe, expect, it } from "vitest";
import { gammaCorrect, hex, hsv, lerp, rgb, scale } from "./color";

describe("hex", () => {
  it("reads six digits with or without the hash", () => {
    // given
    const spellings = ["#ff8000", "FF8000"];

    // when
    const colors = spellings.map(hex);

    // then
    expect(colors).toEqual([
      [255, 128, 0],
      [255, 128, 0],
    ]);
  });

  it("rejects anything else rather than rendering a wrong colour", () => {
    // given
    const notSixDigits = ["#fff", "orange"];

    // when
    const readings = notSixDigits.map((value) => () => hex(value));

    // then
    for (const reading of readings) {
      expect(reading).toThrow(/six digit/);
    }
  });
});

describe("rgb", () => {
  it("clamps and rounds into a byte", () => {
    // given
    const outOfRange = [-20, 300, 12.4] as const;

    // when
    const color = rgb(...outOfRange);

    // then
    expect(color).toEqual([0, 255, 12]);
  });
});

describe("scale", () => {
  it("dims proportionally", () => {
    // given
    const color = [200, 100, 50] as const;

    // when
    const dimmed = scale(color, 0.5);

    // then
    expect(dimmed).toEqual([100, 50, 25]);
  });
});

describe("lerp", () => {
  it("hits both ends exactly", () => {
    // given
    const from = [0, 0, 0] as const;
    const to = [255, 128, 64] as const;

    // when
    const [start, end] = [lerp(from, to, 0), lerp(from, to, 1)];

    // then
    expect(start).toEqual([0, 0, 0]);
    expect(end).toEqual([255, 128, 64]);
  });

  it("clamps t rather than extrapolating past the target", () => {
    // given
    const from = [0, 0, 0] as const;
    const to = [100, 100, 100] as const;

    // when
    const [beyond, before] = [lerp(from, to, 4), lerp(from, to, -4)];

    // then
    expect(beyond).toEqual([100, 100, 100]);
    expect(before).toEqual([0, 0, 0]);
  });
});

describe("hsv", () => {
  it("puts the primaries on the thirds of the wheel", () => {
    // given
    const thirds = [0, 1 / 3, 2 / 3];

    // when
    const colors = thirds.map((hue) => hsv(hue, 1, 1));

    // then
    expect(colors).toEqual([
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ]);
  });

  it("wraps a hue outside the unit range instead of clipping to red", () => {
    // given
    const outside = [1 + 1 / 3, -1 / 3];

    // when
    const [above, below] = outside.map((hue) => hsv(hue, 1, 1));

    // then
    expect(above).toEqual([0, 255, 0]);
    expect(below).toEqual([0, 0, 255]);
  });
});

describe("gammaCorrect", () => {
  it("leaves the endpoints alone", () => {
    // given
    const endpoints = [0, 255];

    // when
    const corrected = endpoints.map(gammaCorrect);

    // then
    expect(corrected).toEqual([0, 255]);
  });

  it("pulls the midpoint well below half, which is the point of it", () => {
    // given
    const midpoint = 128;

    // when
    const corrected = gammaCorrect(midpoint);

    // then
    expect(corrected).toBeLessThan(64);
  });

  it("never goes backwards", () => {
    // given
    const every = Array.from({ length: 255 }, (_, i) => i + 1);

    // when / then - the sweep is the action, so it carries its own assertion
    for (const value of every) {
      expect(gammaCorrect(value), `${value}`).toBeGreaterThanOrEqual(gammaCorrect(value - 1));
    }
  });
});
