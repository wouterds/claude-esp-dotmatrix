import { type Color, type Frame, HEIGHT, hsv, lerp, scale, WIDTH } from "@claude-status/matrix";
import { drawFace } from "./faces";
import { BOLT, BURST, CHECK, CROSS, drawGlyph, HEART, SPARKLE } from "./glyphs";
import { GAUGE_HIGH, GAUGE_LOW, GAUGE_MID, PINK, STATUS_COLORS, WHITE } from "./palette";
import type { PetState, Status } from "./state";

const TAU = Math.PI * 2;

export type Scene = {
  name: string;
  /** Seconds. Null runs until something replaces it. */
  duration: number | null;
  paint: (frame: Frame, elapsed: number, state: PetState) => void;
};

const pulse = (t: number, period: number) => 0.5 + 0.5 * Math.sin((t / period) * TAU);

const sawtooth = (t: number, period: number) => (t % period) / period;

// Deterministic per pixel and per step, so a twinkle is reproducible in a spec
// and a scene has no state to carry between frames.
const noise = (x: number, y: number, step: number) => {
  let h = (x * 374761393 + y * 668265263 + step * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);

  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
};

// Row 7 is the gauge and nothing else may light it - a trail adding to it makes
// the number read high - so the loop closes across row 6 instead.
const FACE_ROWS = HEIGHT - 1;

const BORDER: readonly [number, number][] = (() => {
  const path: [number, number][] = [];
  for (let x = 0; x < WIDTH; x++) path.push([x, 0]);
  for (let y = 1; y < FACE_ROWS; y++) path.push([WIDTH - 1, y]);
  for (let x = WIDTH - 2; x >= 0; x--) path.push([x, FACE_ROWS - 1]);
  for (let y = FACE_ROWS - 2; y >= 1; y--) path.push([0, y]);

  return path;
})();

export const drawGauge = (frame: Frame, fill: number) => {
  const clamped = Math.max(0, Math.min(1, fill));
  const lit = clamped * WIDTH;
  // Held green through the first half rather than ramping from empty, so the
  // colour agrees with the face above it: amber arrives as the mood tires at
  // three quarters, red as it gives out.
  const color =
    clamped < 0.5
      ? GAUGE_LOW
      : clamped < 0.75
        ? lerp(GAUGE_LOW, GAUGE_MID, (clamped - 0.5) / 0.25)
        : lerp(GAUGE_MID, GAUGE_HIGH, (clamped - 0.75) / 0.25);

  for (let x = 0; x < WIDTH; x++) {
    // The last pixel is dimmed by however much of it is filled, so the gauge
    // has eight times the resolution its eight pixels suggest.
    const amount = Math.min(1, lit - x);
    if (amount <= 0) return;

    frame.set(x, HEIGHT - 1, scale(color, 0.3 + 0.7 * amount));
  }
};

// Prime-ish periods, so a blink and a glance drift against each other instead
// of locking into one repeating tic.
const isBlinking = (t: number) => t % 4.3 < 0.14;

const glanceAt = (t: number) => {
  const phase = sawtooth(t, 11);
  if (phase < 0.78) return 0;

  return phase < 0.89 ? -1 : 1;
};

// An accent says what the session is doing without competing with the face for
// the middle of the panel, so every one of these draws at the edges or dim.
const ACCENTS: Partial<Record<Status, (frame: Frame, t: number, color: Color) => void>> = {
  thinking: (frame, t, color) => {
    const head = Math.floor(sawtooth(t, 2.4) * BORDER.length);

    for (let trail = 0; trail < 5; trail++) {
      const [x, y] = BORDER[(head - trail + BORDER.length) % BORDER.length];
      frame.add(x, y, scale(color, 0.9 - trail * 0.18));
    }
  },

  working: (frame, t, color) => {
    const x = Math.round(pulse(t, 1.6) * (WIDTH - 1));

    for (let y = 0; y < FACE_ROWS; y++) {
      frame.add(x, y, scale(color, 0.35));
    }
  },

  reading: (frame, t, color) => {
    const y = Math.round(pulse(t, 2.2) * (FACE_ROWS - 1));

    for (let x = 0; x < WIDTH; x++) {
      frame.add(x, y, scale(color, 0.3));
    }
  },

  running: (frame, t, color) => {
    const strength = 0.25 + 0.55 * pulse(t, 0.7);

    for (const [x, y] of BORDER) {
      frame.add(x, y, scale(color, strength));
    }
  },

  waiting: (frame, t, color) => {
    const on = t % 1.4 < 0.7;
    if (!on) return;

    for (const [x, y] of [
      [0, 0],
      [WIDTH - 1, 0],
    ]) {
      frame.add(x, y, scale(color, 0.7));
    }
  },
};

// How lit the face itself is. Everything breathes a little, an error blinks, and
// nothing sits at a flat brightness - a constant panel reads as a status LED.
const faceBrightness = (status: Status, t: number) => {
  if (status === "error") return t % 0.7 < 0.35 ? 1 : 0.3;
  if (status === "idle") return 0.45 + 0.4 * pulse(t, 5);
  if (status === "waiting") return 0.4 + 0.35 * pulse(t, 3.2);

  return 0.75 + 0.25 * pulse(t, 2.6);
};

export const STATUS_SCENE: Scene = {
  name: "status",
  duration: null,
  paint: (frame, t, state) => {
    const color = STATUS_COLORS[state.status];

    drawFace(frame, state.mood, scale(color, faceBrightness(state.status, t)), {
      blink: isBlinking(t),
      glance: glanceAt(t),
    });

    ACCENTS[state.status]?.(frame, t, color);

    // Another session is blocked on the user. One pixel, in the corner, on its
    // own clock - the panel is already saying what this session is doing and
    // arbitrating between the two would lose one of them.
    if (state.attention) {
      frame.add(WIDTH - 1, 0, scale(STATUS_COLORS.waiting, 0.4 + 0.6 * pulse(t, 1.1)));
    }

    drawGauge(frame, state.fill);
  },
};

const glyphScene = (name: string, glyph: typeof HEART, color: Color, duration: number): Scene => ({
  name,
  duration,
  paint: (frame, t) => {
    drawGlyph(frame, glyph, scale(color, 0.35 + 0.65 * pulse(t, 0.5)));
  },
});

export const ANTICS: readonly Scene[] = [
  {
    name: "dance",
    duration: 2.6,
    paint: (frame, t, state) => {
      const beat = Math.sin(t * 7.5);

      drawFace(frame, state.mood, hsv(sawtooth(t, 1.4), 0.85, 1), {
        glance: beat > 0 ? 1 : -1,
        bob: beat > 0.5 ? -1 : 0,
      });
      drawGauge(frame, state.fill);
    },
  },

  {
    name: "spin",
    duration: 1.8,
    paint: (frame, t) => {
      const angle = sawtooth(t, 0.6) * TAU;

      for (let r = -3.5; r <= 3.5; r += 0.5) {
        const x = 3.5 + r * Math.cos(angle);
        const y = 3.5 + r * Math.sin(angle);
        frame.add(Math.round(x), Math.round(y), scale(WHITE, 0.7));
      }
    },
  },

  {
    name: "wave",
    duration: 2.4,
    paint: (frame, t) => {
      for (let x = 0; x < WIDTH; x++) {
        const y = 3.5 + 3 * Math.sin(t * 3.5 + x * 0.8);
        frame.add(x, Math.round(y), hsv(x / WIDTH + sawtooth(t, 3), 0.9, 1));
      }
    },
  },

  {
    name: "rainbow",
    duration: 2.2,
    paint: (frame, t) => {
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          frame.set(x, y, scale(hsv((x + y) / 16 + sawtooth(t, 1.8), 0.9, 1), 0.6));
        }
      }
    },
  },

  {
    name: "twinkle",
    duration: 2.4,
    paint: (frame, t) => {
      const step = Math.floor(t * 8);

      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const value = noise(x, y, step);
          if (value > 0.86) frame.set(x, y, scale(WHITE, value));
        }
      }
    },
  },

  glyphScene("heart", HEART, PINK, 1.8),
  glyphScene("burst", BURST, STATUS_COLORS.idle, 1.8),
  glyphScene("bolt", BOLT, STATUS_COLORS.waiting, 1.4),
  glyphScene("sparkle", SPARKLE, STATUS_COLORS.thinking, 1.6),
  glyphScene("check", CHECK, STATUS_COLORS.done, 1.6),
  glyphScene("cross", CROSS, STATUS_COLORS.error, 1.4),
];

export const anticNamed = (name: string): Scene | null =>
  ANTICS.find((antic) => antic.name === name) ?? null;

export const ANTIC_NAMES = ANTICS.map((antic) => antic.name);
