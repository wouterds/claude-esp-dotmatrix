export const WIDTH = 8;
export const HEIGHT = 8;
const LED_COUNT = WIDTH * HEIGHT;
export const FRAME_BYTES = LED_COUNT * 3;

// 64 WS2812s at full white draw 3.8 A. The firmware scales any frame that would
// exceed its 450 mA budget, so this ceiling is about how the pet looks rather
// than about the supply - above it a dark room gets a nightlight.
export const MAX_BRIGHTNESS = 96;
export const DEFAULT_BRIGHTNESS = 32;

const MAGIC_0 = 0xc1;
const MAGIC_1 = 0xa0;

const CMD_FRAME = 0x01;
const CMD_BRIGHTNESS = 0x02;
const CMD_PING = 0x03;
const CMD_CLEAR = 0x04;

const EMPTY = new Uint8Array(0);

const encode = (command: number, payload: Uint8Array = EMPTY): Uint8Array => {
  const packet = new Uint8Array(5 + payload.length);

  packet[0] = MAGIC_0;
  packet[1] = MAGIC_1;
  packet[2] = command;
  packet[3] = payload.length;
  packet.set(payload, 4);

  let checksum = command ^ payload.length;
  for (const byte of payload) {
    checksum ^= byte;
  }
  packet[packet.length - 1] = checksum;

  return packet;
};

export const encodeFrame = (pixels: Uint8Array): Uint8Array => {
  if (pixels.length !== FRAME_BYTES) {
    throw new Error(`frame must be ${FRAME_BYTES} bytes, got ${pixels.length}`);
  }

  return encode(CMD_FRAME, pixels);
};

export const encodeBrightness = (level: number): Uint8Array => {
  const clamped = Math.max(0, Math.min(MAX_BRIGHTNESS, Math.round(level)));

  return encode(CMD_BRIGHTNESS, Uint8Array.of(clamped));
};

export const encodePing = (): Uint8Array => encode(CMD_PING);

export const encodeClear = (): Uint8Array => encode(CMD_CLEAR);
