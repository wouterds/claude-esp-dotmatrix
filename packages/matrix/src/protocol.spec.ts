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
    // given
    const pixels = new Uint8Array(FRAME_BYTES).fill(7);

    // when
    const packet = encodeFrame(pixels);

    // then
    expect(packet.length).toBe(FRAME_BYTES + 5);
    expect([...packet.slice(0, 4)]).toEqual([0xc1, 0xa0, 0x01, FRAME_BYTES]);
    expect(packet.at(-1)).toBe(checksumOf(packet));
  });

  it("rejects a frame that is not exactly one screen", () => {
    // given
    const short = new Uint8Array(FRAME_BYTES - 1);

    // when
    const encoding = () => encodeFrame(short);

    // then
    expect(encoding).toThrow(/192 bytes/);
  });
});

describe("encodeBrightness", () => {
  it("clamps above the ceiling rather than wrapping the byte", () => {
    // given
    const impossible = [9000, -5];

    // when
    const [over, under] = impossible.map(encodeBrightness);

    // then
    expect(over[4]).toBe(MAX_BRIGHTNESS);
    expect(under[4]).toBe(0);
  });

  it("rounds a fractional level", () => {
    // given
    const fractional = 12.6;

    // when
    const packet = encodeBrightness(fractional);

    // then
    expect(packet[4]).toBe(13);
  });
});

describe("payload free commands", () => {
  it("declares a zero length and checksums the command alone", () => {
    // given
    const commands = [encodePing, encodeClear];

    // when
    const packets = commands.map((encode) => encode());

    // then
    for (const packet of packets) {
      expect(packet.length).toBe(5);
      expect(packet[3]).toBe(0);
      expect(packet.at(-1)).toBe(checksumOf(packet));
    }
  });
});
