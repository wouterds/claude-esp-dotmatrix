import { describe, expect, it } from "vitest";
import {
  encodeBrightness,
  encodeClear,
  encodeFrame,
  encodePing,
  FRAME_BYTES,
  MAX_BRIGHTNESS,
} from "./protocol";

const checksumOf = (packet: Uint8Array) => {
  const body = packet.slice(2, -1);
  let checksum = 0;
  for (const byte of body) {
    checksum ^= byte;
  }

  return checksum;
};

describe("encodeFrame", () => {
  it("wraps the pixels in magic, command, length and checksum", () => {
    const pixels = new Uint8Array(FRAME_BYTES).fill(7);
    const packet = encodeFrame(pixels);

    expect(packet.length).toBe(FRAME_BYTES + 5);
    expect([...packet.slice(0, 4)]).toEqual([0xc1, 0xa0, 0x01, FRAME_BYTES]);
    expect(packet.at(-1)).toBe(checksumOf(packet));
  });

  it("rejects a frame that is not exactly one screen", () => {
    expect(() => encodeFrame(new Uint8Array(FRAME_BYTES - 1))).toThrow(/192 bytes/);
  });
});

describe("encodeBrightness", () => {
  it("clamps above the ceiling rather than wrapping the byte", () => {
    expect(encodeBrightness(9000)[4]).toBe(MAX_BRIGHTNESS);
    expect(encodeBrightness(-5)[4]).toBe(0);
  });

  it("rounds a fractional level", () => {
    expect(encodeBrightness(12.6)[4]).toBe(13);
  });
});

describe("payload free commands", () => {
  it("declares a zero length and checksums the command alone", () => {
    for (const packet of [encodePing(), encodeClear()]) {
      expect(packet.length).toBe(5);
      expect(packet[3]).toBe(0);
      expect(packet.at(-1)).toBe(checksumOf(packet));
    }
  });
});
