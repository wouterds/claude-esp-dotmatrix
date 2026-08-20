import { describe, expect, it } from "vitest";
import { gammaCorrect } from "./color";
import { createFrame, isRotation, type Rotation } from "./frame";
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
    // given
    const frame = createFrame();

    // when
    frame.set(3, 5, [10, 20, 30]);

    // then
    expect(frame.get(3, 5)).toEqual([10, 20, 30]);
  });

  it("drops pixels off the edge, because scenes draw past it on purpose", () => {
    // given
    const frame = createFrame();

    // when
    frame.set(-1, 0, [255, 255, 255]);
    frame.set(8, 8, [255, 255, 255]);

    // then
    expect(litIndices(frame.toBytes())).toEqual([]);
  });

  it("saturates on add rather than wrapping to dark", () => {
    // given
    const frame = createFrame();
    frame.set(0, 0, [200, 200, 200]);

    // when
    frame.add(0, 0, [100, 100, 100]);

    // then
    expect(frame.get(0, 0)).toEqual([255, 255, 255]);
  });

  it("clears every byte", () => {
    // given
    const frame = createFrame();
    frame.fill([1, 2, 3]);

    // when
    frame.clear();

    // then
    expect(frame.toBytes()).toEqual(new Uint8Array(FRAME_BYTES));
  });
});

describe("toBytes", () => {
  it("gamma corrects on the way to the wire", () => {
    // given
    const frame = createFrame();
    frame.set(0, 0, [128, 128, 128]);

    // when
    const wire = frame.toBytes();

    // then
    expect(wire[0]).toBe(gammaCorrect(128));
  });

  it("walks the chain across a row before moving down, unrotated", () => {
    // given
    const frame = createFrame();
    frame.set(1, 2, [255, 255, 255]);

    // when
    const wire = frame.toBytes(0);

    // then
    expect(litIndices(wire)).toEqual([2 * 8 + 1]);
  });

  it("keeps the two axes distinct, which is what a transpose would break", () => {
    // given
    const alongX = createFrame();
    const alongY = createFrame();
    alongX.set(1, 0, [255, 255, 255]);
    alongY.set(0, 1, [255, 255, 255]);

    // when
    const [byX, byY] = [litIndices(alongX.toBytes(0)), litIndices(alongY.toBytes(0))];

    // then - one step along x is one LED; one step along y is a whole row.
    expect(byX).toEqual([1]);
    expect(byY).toEqual([8]);
  });

  it("turns the top left pixel through each corner in quarter turns", () => {
    // given
    const rotations: Rotation[] = [0, 90, 180, 270];

    // when
    const corners = rotations.map((rotation) => {
      const frame = createFrame();
      frame.set(0, 0, [255, 255, 255]);

      return litIndices(frame.toBytes(rotation))[0];
    });

    // then
    expect(corners).toEqual([0, 7, 63, 56]);
  });

  it("is reversible - four quarter turns of a shape land back on themselves", () => {
    // given
    const frame = createFrame();
    frame.set(0, 1, [255, 0, 0]);
    frame.set(6, 3, [0, 255, 0]);

    // when
    const once = litIndices(frame.toBytes(90));
    const twice = litIndices(frame.toBytes(270));

    // then
    expect(once).not.toEqual(litIndices(frame.toBytes(0)));
    expect(once.length).toBe(twice.length);
  });
});

describe("isRotation", () => {
  it("accepts only the quarter turns", () => {
    // given
    const candidates = [180, 45];

    // when
    const [quarter, other] = candidates.map(isRotation);

    // then
    expect(quarter).toBe(true);
    expect(other).toBe(false);
  });
});
