import { type Color, type Frame, HEIGHT, hsv, scale, WIDTH } from "@claude-status/matrix";
import { drawFace } from "./faces";
import { BOLT, BURST, CHECK, CROSS, drawGlyph, HEART, SPARKLE } from "./glyphs";
import { GAUGE_BANDS, PINK, STATUS_COLORS, WHITE } from "./palette";
import type { PetState, Status } from "./state";

const TAU = Math.PI * 2;

export type Scene = {
  name: string;
  /** Relative chance of being picked at random. Defaults to 1. */
  weight?: number;
  /** Seconds. Null runs until something replaces it. */
  duration: number | null;
  /**
   * `seed` is 0 to 1, fixed for one playing of the scene. It is an argument
   * rather than a call to Math.random inside, so a scene stays a pure function
   * of its inputs and a spec can still assert what it drew.
   */
  paint: (frame: Frame, elapsed: number, state: PetState, seed?: number) => void;
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

// Row 7 is the context gauge. Row 0 carries nothing of its own, which leaves it
// to the spinner.
const GAUGE_ROW = HEIGHT - 1;
const FACE_TOP = 1;
const FACE_ROWS = HEIGHT - 2;

// The whole perimeter, the gauge row included. The orbit is drawn after the gauge
// so it passes visibly over rather than behind - and only ever adds, so the bar
// can be brightened by it but never eaten into.
const BORDER: readonly [number, number][] = (() => {
  const path: [number, number][] = [];
  for (let x = 0; x < WIDTH; x++) path.push([x, 0]);
  for (let y = 1; y < HEIGHT; y++) path.push([WIDTH - 1, y]);
  for (let x = WIDTH - 2; x >= 0; x--) path.push([x, HEIGHT - 1]);
  for (let y = HEIGHT - 2; y >= 1; y--) path.push([0, y]);

  return path;
})();

export const drawGauge = (frame: Frame, fill: number) => {
  const clamped = Math.max(0, Math.min(1, fill));
  const lit = clamped * WIDTH;
  const band = GAUGE_BANDS.find((candidate) => clamped <= candidate.upTo) ?? GAUGE_BANDS[3];
  const color = band.color;

  for (let x = 0; x < WIDTH; x++) {
    // The last pixel is dimmed by however much of it is filled, so the gauge
    // has eight times the resolution its eight pixels suggest.
    const amount = Math.min(1, lit - x);
    if (amount <= 0) return;

    frame.set(x, GAUGE_ROW, scale(color, 0.3 + 0.7 * amount));
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

    for (let y = FACE_TOP; y < FACE_TOP + FACE_ROWS; y++) {
      frame.add(x, y, scale(color, 0.35));
    }
  },

  reading: (frame, t, color) => {
    const y = FACE_TOP + Math.round(pulse(t, 2.2) * (FACE_ROWS - 1));

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

    // Gauge first, accents over it: the orbit is meant to be seen crossing the
    // edge, and drawing it underneath would make it vanish behind a full bar.
    drawGauge(frame, state.fill);

    ACCENTS[state.status]?.(frame, t, color);

    // Another session is blocked on the user. One pixel, in the corner, on its
    // own clock - the panel is already saying what this session is doing and
    // arbitrating between the two would lose one of them.
    if (state.attention) {
      frame.add(WIDTH - 1, 0, scale(STATUS_COLORS.waiting, 0.4 + 0.6 * pulse(t, 1.1)));
    }
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

  { ...glyphScene("heart", HEART, PINK, 1.8), weight: 4 },
  glyphScene("burst", BURST, STATUS_COLORS.idle, 1.8),
  glyphScene("bolt", BOLT, STATUS_COLORS.waiting, 1.4),
  glyphScene("sparkle", SPARKLE, STATUS_COLORS.thinking, 1.6),
  glyphScene("check", CHECK, STATUS_COLORS.done, 1.6),
  glyphScene("cross", CROSS, STATUS_COLORS.error, 1.4),
];

// Scenes that mean something, and so are never picked at random. A directional
// sweep that turns up on its own reads as "you switched sessions" when nothing
// happened, which is worse than not having it.
const SWITCH_DURATION = 1.3;

export const SIGNALS: readonly Scene[] = [
  {
    name: "switch",
    duration: SWITCH_DURATION,
    // One arrow the size of the panel, flying across and dragging a tail behind
    // it. A hand-over is the one event here that is about two things rather than
    // one, so it gets the whole display rather than a corner of it.
    paint: (frame, t, _state, seed = 0) => {
      // A different colour each time, so two switches in a row read as two
      // events. Status colour would be the obvious choice and is the wrong one:
      // it makes the sweep look like a status the panel is about to settle on.
      const color = hsv(seed, 0.85, 1);
      const middle = (HEIGHT - 1) / 2;
      // Starts with its point already on the panel rather than sliding in from
      // off-screen, so no frame of the sweep is blank.
      const lead = 0.5 + sawtooth(t, SWITCH_DURATION) * (WIDTH + 10);

      for (let y = 0; y < HEIGHT; y++) {
        // The head is a diagonal, so the arrow has a point rather than an edge.
        const head = lead - Math.abs(y - middle);

        for (let depth = 0; depth < 3; depth++) {
          frame.add(Math.round(head - depth), y, scale(color, 1 - depth * 0.22));
        }

        // A tail on the middle rows only, which is what makes the whole thing
        // read as one arrow rather than a moving diagonal line.
        if (Math.abs(y - middle) > 1) continue;

        for (let x = 0; x < Math.round(head) - 2; x++) {
          frame.add(x, y, scale(color, 0.45));
        }
      }
    },
  },
];

const NAMED = [...ANTICS, ...SIGNALS];

export const anticNamed = (name: string): Scene | null =>
  NAMED.find((scene) => scene.name === name) ?? null;

export const ANTIC_NAMES = NAMED.map((scene) => scene.name);
