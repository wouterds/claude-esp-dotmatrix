import { describe, expect, it } from "vitest";
import { gammaCorrect, hex, hsv, lerp, rgb, scale } from "./color";

describe("hex", () => {
  it("reads six digits with or without the hash", () => {
    expect(hex("#ff8000")).toEqual([255, 128, 0]);
    expect(hex("FF8000")).toEqual([255, 128, 0]);
  });

  it("rejects anything else rather than rendering a wrong colour", () => {
    expect(() => hex("#fff")).toThrow(/six digit/);
    expect(() => hex("orange")).toThrow(/six digit/);
  });
});

describe("rgb", () => {
  it("clamps and rounds into a byte", () => {
    expect(rgb(-20, 300, 12.4)).toEqual([0, 255, 12]);
  });
});

describe("scale", () => {
  it("dims proportionally", () => {
    expect(scale([200, 100, 50], 0.5)).toEqual([100, 50, 25]);
  });
});

describe("lerp", () => {
  it("hits both ends exactly", () => {
    expect(lerp([0, 0, 0], [255, 128, 64], 0)).toEqual([0, 0, 0]);
    expect(lerp([0, 0, 0], [255, 128, 64], 1)).toEqual([255, 128, 64]);
  });

  it("clamps t rather than extrapolating past the target", () => {
    expect(lerp([0, 0, 0], [100, 100, 100], 4)).toEqual([100, 100, 100]);
    expect(lerp([0, 0, 0], [100, 100, 100], -4)).toEqual([0, 0, 0]);
  });
});

describe("hsv", () => {
  it("puts the primaries on the thirds of the wheel", () => {
    expect(hsv(0, 1, 1)).toEqual([255, 0, 0]);
    expect(hsv(1 / 3, 1, 1)).toEqual([0, 255, 0]);
    expect(hsv(2 / 3, 1, 1)).toEqual([0, 0, 255]);
  });

  it("wraps a hue outside the unit range instead of clipping to red", () => {
    expect(hsv(1 + 1 / 3, 1, 1)).toEqual([0, 255, 0]);
    expect(hsv(-1 / 3, 1, 1)).toEqual([0, 0, 255]);
  });
});

describe("gammaCorrect", () => {
  it("leaves the endpoints alone", () => {
    expect(gammaCorrect(0)).toBe(0);
    expect(gammaCorrect(255)).toBe(255);
  });

  it("pulls the midpoint well below half, which is the point of it", () => {
    expect(gammaCorrect(128)).toBeLessThan(64);
  });

  it("never goes backwards", () => {
    for (let i = 1; i < 256; i++) {
      expect(gammaCorrect(i)).toBeGreaterThanOrEqual(gammaCorrect(i - 1));
    }
  });
});
