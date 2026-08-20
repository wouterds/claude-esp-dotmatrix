export type Color = readonly [number, number, number];

export const BLACK: Color = [0, 0, 0];

const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export const rgb = (r: number, g: number, b: number): Color => [byte(r), byte(g), byte(b)];

export const hex = (value: string): Color => {
  const digits = value.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(digits)) {
    throw new Error(`not a six digit hex colour: ${value}`);
  }

  const packed = Number.parseInt(digits, 16);

  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
};

export const scale = (color: Color, factor: number): Color =>
  rgb(color[0] * factor, color[1] * factor, color[2] * factor);

export const lerp = (from: Color, to: Color, t: number): Color => {
  const clamped = Math.max(0, Math.min(1, t));

  return rgb(
    from[0] + (to[0] - from[0]) * clamped,
    from[1] + (to[1] - from[1]) * clamped,
    from[2] + (to[2] - from[2]) * clamped,
  );
};

export const hsv = (h: number, s: number, v: number): Color => {
  const hue = ((h % 1) + 1) % 1;
  const sector = hue * 6;
  const c = v * s;
  const x = c * (1 - Math.abs((sector % 2) - 1));
  const m = v - c;

  const wheel: readonly Color[] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = wheel[Math.floor(sector) % 6];

  return rgb((r + m) * 255, (g + m) * 255, (b + m) * 255);
};

// A WS2812's output is close to linear in its byte, but perceived brightness is
// not - so a scene that fades to a quarter looks half lit, and every crossfade
// blows out at the top end. Correcting on the way to the wire keeps scene
// arithmetic in the space a human is judging it by.
const GAMMA = Uint8Array.from({ length: 256 }, (_, i) => Math.round(255 * (i / 255) ** 2.2));

export const gammaCorrect = (value: number): number => GAMMA[byte(value)];
