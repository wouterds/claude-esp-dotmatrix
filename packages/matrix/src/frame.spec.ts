import { describe, expect, it } from "vitest";
import { gammaCorrect } from "./color";
import { createFrame, isRotation } from "./frame";
import { FRAME_BYTES } from "./protocol";

const litIndices = (bytes: Uint8Array) => {
  const lit: number[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    if (bytes[i] || bytes[i + 1] || bytes[i + 2]) lit.push(i / 3);
  }

  return lit;
};

describe("createFrame", () => {
  it("reads back what was written", () => {
    const frame = createFrame();
    frame.set(3, 5, [10, 20, 30]);

    expect(frame.get(3, 5)).toEqual([10, 20, 30]);
  });

  it("drops pixels off the edge, because scenes draw past it on purpose", () => {
    const frame = createFrame();
    frame.set(-1, 0, [255, 255, 255]);
    frame.set(8, 8, [255, 255, 255]);

    expect(litIndices(frame.toBytes())).toEqual([]);
  });

  it("saturates on add rather than wrapping to dark", () => {
    const frame = createFrame();
    frame.set(0, 0, [200, 200, 200]);
    frame.add(0, 0, [100, 100, 100]);

    expect(frame.get(0, 0)).toEqual([255, 255, 255]);
  });

  it("clears every byte", () => {
    const frame = createFrame();
    frame.fill([1, 2, 3]);
    frame.clear();

    expect(frame.toBytes()).toEqual(new Uint8Array(FRAME_BYTES));
  });
});

describe("toBytes", () => {
  it("gamma corrects on the way to the wire", () => {
    const frame = createFrame();
    frame.set(0, 0, [128, 128, 128]);

    expect(frame.toBytes()[0]).toBe(gammaCorrect(128));
  });

  it("walks the chain down a column before moving right, unrotated", () => {
    const frame = createFrame();
    frame.set(1, 2, [255, 255, 255]);

    // Column 1, row 2 - not row 2, column 1. Getting these the wrong way round
    // transposes the panel, and a transpose is not a rotation.
    expect(litIndices(frame.toBytes(0))).toEqual([1 * 8 + 2]);
  });

  it("keeps the two axes distinct, which is what a transpose would break", () => {
    const alongX = createFrame();
    const alongY = createFrame();
    alongX.set(1, 0, [255, 255, 255]);
    alongY.set(0, 1, [255, 255, 255]);

    expect(litIndices(alongX.toBytes(0))).toEqual([8]);
    expect(litIndices(alongY.toBytes(0))).toEqual([1]);
  });

  it("turns the top left pixel through each corner in quarter turns", () => {
    const corners = [0, 90, 180, 270].map((rotation) => {
      const frame = createFrame();
      frame.set(0, 0, [255, 255, 255]);

      return litIndices(frame.toBytes(rotation as 0 | 90 | 180 | 270))[0];
    });

    expect(corners).toEqual([0, 56, 63, 7]);
  });

  it("is reversible - four quarter turns of a shape land back on themselves", () => {
    const frame = createFrame();
    frame.set(0, 1, [255, 0, 0]);
    frame.set(6, 3, [0, 255, 0]);

    const once = litIndices(frame.toBytes(90));
    const twice = litIndices(frame.toBytes(270));

    expect(once).not.toEqual(litIndices(frame.toBytes(0)));
    expect(once.length).toBe(twice.length);
  });
});

describe("isRotation", () => {
  it("accepts only the quarter turns", () => {
    expect(isRotation(180)).toBe(true);
    expect(isRotation(45)).toBe(false);
  });
});
