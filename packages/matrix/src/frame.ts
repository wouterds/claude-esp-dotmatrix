import { BLACK, type Color, gammaCorrect } from "./color";
import { FRAME_BYTES, HEIGHT, WIDTH } from "./protocol";

// The module chains its 64 LEDs across the first row, then across the second -
// left to right, top to bottom.
//
// This was briefly "fixed" to column-major on the strength of an orientation
// marker whose arms came back swapped. They had not: the firmware was driving an
// RGB strip as GRB, which swaps red and green and so swapped the two arms'
// colours rather than their positions. Transposing the panel to correct a colour
// bug then made an up arrow point left, which is the shape of the mistake -
// check the colours are right before believing anything about the geometry.
const chainIndex = (column: number, row: number) => row * WIDTH + column;

// Which way up the panel ends on a desk is the owner's business, so every scene
// draws in one orientation and the buffer is turned on its way to the wire.
export type Rotation = 0 | 90 | 180 | 270;

export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

export const isRotation = (value: number): value is Rotation =>
  ROTATIONS.includes(value as Rotation);

const ledIndex = (x: number, y: number, rotation: Rotation) => {
  if (rotation === 90) return chainIndex(WIDTH - 1 - y, x);
  if (rotation === 180) return chainIndex(WIDTH - 1 - x, HEIGHT - 1 - y);
  if (rotation === 270) return chainIndex(y, HEIGHT - 1 - x);

  return chainIndex(x, y);
};

export type Frame = {
  set: (x: number, y: number, color: Color) => void;
  add: (x: number, y: number, color: Color) => void;
  get: (x: number, y: number) => Color;
  fill: (color: Color) => void;
  clear: () => void;
  toBytes: (rotation?: Rotation) => Uint8Array;
};

export const createFrame = (): Frame => {
  const pixels = new Uint8Array(FRAME_BYTES);

  // Scenes draw sprites that hang off the edge and orbit past the corners, so
  // clipping here is the normal case rather than a caller's mistake.
  const offsetOf = (x: number, y: number) => {
    const inside = x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;

    return inside ? (Math.trunc(y) * WIDTH + Math.trunc(x)) * 3 : -1;
  };

  const set: Frame["set"] = (x, y, color) => {
    const at = offsetOf(x, y);
    if (at < 0) return;

    pixels[at] = color[0];
    pixels[at + 1] = color[1];
    pixels[at + 2] = color[2];
  };

  const add: Frame["add"] = (x, y, color) => {
    const at = offsetOf(x, y);
    if (at < 0) return;

    pixels[at] = Math.min(255, pixels[at] + color[0]);
    pixels[at + 1] = Math.min(255, pixels[at + 1] + color[1]);
    pixels[at + 2] = Math.min(255, pixels[at + 2] + color[2]);
  };

  const get: Frame["get"] = (x, y) => {
    const at = offsetOf(x, y);
    if (at < 0) return BLACK;

    return [pixels[at], pixels[at + 1], pixels[at + 2]];
  };

  const fill: Frame["fill"] = (color) => {
    for (let i = 0; i < FRAME_BYTES; i += 3) {
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
    }
  };

  const clear = () => pixels.fill(0);

  const toBytes: Frame["toBytes"] = (rotation = 0) => {
    const wire = new Uint8Array(FRAME_BYTES);

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const from = (y * WIDTH + x) * 3;
        const to = ledIndex(x, y, rotation) * 3;

        wire[to] = gammaCorrect(pixels[from]);
        wire[to + 1] = gammaCorrect(pixels[from + 1]);
        wire[to + 2] = gammaCorrect(pixels[from + 2]);
      }
    }

    return wire;
  };

  return { set, add, get, fill, clear, toBytes };
};
