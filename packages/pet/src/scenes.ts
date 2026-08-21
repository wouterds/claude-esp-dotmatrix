import { type Color, type Frame, HEIGHT, hsv, lerp, scale, WIDTH } from "@claude-status/matrix";
import { drawFace } from "./faces";
import { BOLT, BURST, CROSS, drawGlyph, GHOST, type Glyph, INVADER, mirrored } from "./glyphs";
import { EXHAUSTED, GAUGE_BANDS, PINK, STATUS_COLORS, VIOLET, WHITE } from "./palette";
import type { PetState, Status } from "./state";

const TAU = Math.PI * 2;

export type Scene = {
  name: string;
  /** Relative chance of being picked while there is room left. Defaults to 1. */
  weight?: number;
  /**
   * Relative chance once the context window is spent. Defaults to `weight`.
   *
   * The two are interpolated, so a fresh session is mostly energetic and a spent
   * one mostly is not - without the pool changing shape at a threshold.
   */
  spentWeight?: number;
  /** Seconds. Null runs until something replaces it. */
  duration: number | null;
  /**
   * Declares that the scene has a direction and wants it turned round each time
   * it plays. The director keeps the alternation, so a scene stays stateless.
   */
  mirrors?: boolean;
  /**
   * `seed` is 0 to 1 and `mirrored` flips the direction; both are fixed for one
   * playing. They are arguments rather than calls to Math.random inside, so a
   * scene stays a pure function of its inputs and a spec can assert what it drew.
   */
  paint: (
    frame: Frame,
    elapsed: number,
    state: PetState,
    seed?: number,
    mirrored?: boolean,
  ) => void;
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

// Both edge rows are numbers, and the face has the six between them. The 5h
// window is on the bottom because it is the one that bites first and so is the
// one glanced at; the week sits on top, where the corner dot already lives.
export const FIVE_HOUR_ROW = HEIGHT - 1;
export const WEEKLY_ROW = 0;
const FACE_TOP = 1;
const FACE_ROWS = HEIGHT - 2;

// The whole perimeter, both number rows included. The orbit is drawn after them
// so it passes visibly over rather than behind - and only ever adds, so a bar can
// be brightened by it but never eaten into.
const BORDER: readonly [number, number][] = (() => {
  const path: [number, number][] = [];
  for (let x = 0; x < WIDTH; x++) path.push([x, 0]);
  for (let y = 1; y < HEIGHT; y++) path.push([WIDTH - 1, y]);
  for (let x = WIDTH - 2; x >= 0; x--) path.push([x, HEIGHT - 1]);
  for (let y = HEIGHT - 2; y >= 1; y--) path.push([0, y]);

  return path;
})();

export const drawBar = (frame: Frame, row: number, used: number, override?: Color) => {
  const clamped = Math.max(0, Math.min(1, used));
  // Never fewer than one pixel. A known quota that happens to be empty has to
  // look different from one nothing has reported, and dark is already taken by
  // the second - so a fresh window reads as one green pixel rather than as a
  // row that might mean either.
  const lit = Math.max(1, clamped * WIDTH);
  const band = GAUGE_BANDS.find((candidate) => clamped <= candidate.upTo) ?? GAUGE_BANDS[3];
  const color = override ?? band.color;

  for (let x = 0; x < WIDTH; x++) {
    // The last pixel is dimmed by however much of it is filled, so a bar has
    // eight times the resolution its eight pixels suggest.
    const amount = Math.min(1, lit - x);
    if (amount <= 0) return;

    frame.set(x, row, scale(color, 0.3 + 0.7 * amount));
  }
};

/**
 * Both quota rows, in the same four bands at the same brightness - position is
 * what tells them apart. A second vocabulary for the top row would be one more
 * thing to learn than a panel this size can carry.
 *
 * A quota nothing has reported stays dark. A row defaulting to empty would read
 * as "none of the week used", which is the one wrong answer that looks like good
 * news - and the rule everywhere else here is that a gauge may understate but
 * must never overstate.
 */
export const drawGauges = (frame: Frame, state: PetState, spent?: Color) => {
  // A row that has run out takes the cross's own red and its breath with it,
  // rather than sitting at the top gauge band. The band tops out at a warm
  // orange that reads as "nearly", and this is past nearly.
  const paint = (row: number, used: number) =>
    drawBar(frame, row, used, spent && used >= 1 ? spent : undefined);

  if (state.sevenDay !== null) paint(WEEKLY_ROW, state.sevenDay);
  if (state.fiveHour !== null) paint(FIVE_HOUR_ROW, state.fiveHour);
};

/**
 * How spent the session is: nothing until the window is half gone, all the way by
 * the time it is full.
 *
 * Drives two things the eyes cannot say on their own - the face is tinted towards
 * the gauge's red, and its own clock slows down. Both are on the *context* window
 * rather than the subscription's, because that is the one the pet is running out
 * of head in.
 */
export const fatigueOf = (fill: number) => Math.max(0, Math.min(1, (fill - 0.5) / 0.5));

// Partway to red, which lands a blue status on a muted rose rather than an alarm.
// Judged on the panel: 0.85 was harsher than it needed to be, and the eyes and
// the gauge are already saying how bad it is.
const TINT = 0.6;

// Fast, because it is the one thing on here that wants acting on. Three a second
// reads as a summons where the gauge and the face read as information.
const BLINK_PERIOD = 0.34;

// Escalating with the number of chats stuck on the user, in the gauge's own three
// colours so nothing on the panel invents a fourth vocabulary.
const alarmColor = (waiting: number): Color | null => {
  if (waiting >= 3) return GAUGE_BANDS[3].color;
  if (waiting === 2) return GAUGE_BANDS[2].color;
  if (waiting === 1) return GAUGE_BANDS[1].color;

  return null;
};
const SLOWEST = 0.5;

// Prime-ish periods, so a blink and a glance drift against each other instead
// of locking into one repeating tic.
const isBlinking = (t: number) => t % 4.3 < 0.14;

// The eight directions and centre. Looking ahead most of the time and then
// somewhere for a moment is what separates a face from a graphic - a fixed
// horizontal flick used two of the nine and read as a tic.
const GAZE: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];

const GAZE_PERIOD = 3.7;
const AHEAD = 0.62;

const gazeAt = (t: number): readonly [number, number] => {
  const phase = (t % GAZE_PERIOD) / GAZE_PERIOD;
  if (phase < AHEAD) return [0, 0];

  // Hashed off the interval rather than random, so a scene stays a pure function
  // of its inputs and holds one direction for the whole glance.
  const step = Math.floor(t / GAZE_PERIOD);

  return GAZE[Math.min(GAZE.length - 1, Math.floor(noise(3, 7, step) * GAZE.length))];
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

  // A laser rather than a marker: the whole height of the panel, quota rows
  // included, and in its own pink rather than the status colour so it reads as a
  // beam crossing everything rather than as part of whatever it happens to cross.
  //
  // It only ever adds, so it passes over the two number rows and brightens them
  // without being able to eat into either bar.
  working: (frame, t) => {
    const x = Math.round(pulse(t, 1.6) * (WIDTH - 1));

    for (let y = 0; y < HEIGHT; y++) {
      frame.add(x, y, scale(PINK, 0.7));
    }
  },

  reading: (frame, t, color) => {
    const y = FACE_TOP + Math.round(pulse(t, 2.2) * (FACE_ROWS - 1));

    for (let x = 0; x < WIDTH; x++) {
      frame.add(x, y, scale(color, 0.3));
    }
  },

  // `running` has no accent. Lighting the whole perimeter at once was the
  // loudest thing on an already busy panel, and it fired on every command - so
  // the one status that happens constantly was the one shouting. The status
  // colour and the laser say enough between them.
};

// How lit the face itself is. Everything breathes a little, an error blinks, and
// nothing sits at a flat brightness - a constant panel reads as a status LED.
const faceBrightness = (status: Status, t: number) => {
  if (status === "error") return t % 0.7 < 0.35 ? 1 : 0.3;
  if (status === "idle") return 0.45 + 0.4 * pulse(t, 5);
  if (status === "waiting") return 0.4 + 0.35 * pulse(t, 3.2);

  return 0.75 + 0.25 * pulse(t, 2.6);
};

/**
 * The corner dot, painted over whatever scene is running rather than as part of
 * one. One dot, top right, blinking fast: how many chats are waiting is in the
 * colour rather than in more pixels, because a row of indicators would compete
 * with the face.
 *
 * It used to live inside the status scene, which meant it vanished for the two
 * seconds an antic was playing - and *that* is why antics were suppressed while a
 * session was waiting. As an overlay it is always there, so they need not be.
 */
export const drawAlarm = (frame: Frame, waiting: number, t: number) => {
  const alarm = alarmColor(waiting);
  if (!alarm) return;

  if (t % BLINK_PERIOD < BLINK_PERIOD / 2) frame.set(WIDTH - 1, 0, alarm);
};

/**
 * Either quota gone. Not the same thing as a full context window - that is the
 * pet running out of head and the face already says it - this is the account
 * having nothing left to spend until the window turns over.
 */
export const isSpent = (state: PetState) =>
  (state.fiveHour ?? 0) >= 1 || (state.sevenDay ?? 0) >= 1;

// Long enough that each half is looked at rather than flickered past.
const SPENT_HALF = 2.5;

/**
 * The cross and a dead face, alternating, both glowing in the error red.
 *
 * Alternating rather than either one holding, because a panel that never changes
 * reads as a crashed one - and this is the state most likely to be stared at
 * while someone works out whether the thing is still alive.
 */
const paintSpent = (frame: Frame, t: number, state: PetState) => {
  const glow = scale(STATUS_COLORS.error, 0.35 + 0.65 * pulse(t, 1.2));

  if (t % (SPENT_HALF * 2) < SPENT_HALF) {
    drawGlyph(frame, CROSS, glow);

    return;
  }

  drawFace(frame, "dead", glow);
  // The bars come back with the face, so which of the two ran out stays
  // readable. The cross covers them for its own half and that is the point of it.
  // Whichever hit its limit breathes in step with the cross that just left.
  drawGauges(frame, state, glow);
};

export const STATUS_SCENE: Scene = {
  name: "status",
  duration: null,
  paint: (frame, t, state) => {
    if (isSpent(state)) {
      paintSpent(frame, t, state);

      return;
    }

    const fatigue = fatigueOf(state.fill);
    // Tinted rather than replaced, so the status is still legible in the colour
    // while the face reddens.
    const color = lerp(STATUS_COLORS[state.status], EXHAUSTED, TINT * fatigue);
    // The face keeps its own clock, and it drags. Blinking and looking around go
    // half speed by the time the window is gone - the accents stay on real time,
    // because a slow spinner reads as the machine lagging rather than the pet
    // being tired.
    const weary = t * (1 - SLOWEST * fatigue);

    drawFace(frame, state.mood, scale(color, faceBrightness(state.status, weary)), {
      blink: isBlinking(weary),
      gaze: gazeAt(weary),
    });

    // Gauges first, accents over them: the orbit is meant to be seen crossing the
    // edge, and drawing it underneath would make it vanish behind a full bar.
    drawGauges(frame, state);

    ACCENTS[state.status]?.(frame, t, color);
  },
};

// Two turns across an 1.8s run: long enough to read as facing a way rather
// than as flickering.
const GHOST_TURN = 0.6;

const glyphScene = (name: string, glyph: Glyph, color: Color, duration: number): Scene => ({
  name,
  duration,
  paint: (frame, t) => {
    drawGlyph(frame, glyph, scale(color, 0.35 + 0.65 * pulse(t, 0.5)));
  },
});

// Everything here is a pure function of its elapsed time and its seed, same as the
// rest - no scene keeps anything between frames, which is what lets a spec assert
// what got drawn.
const PLAYFUL: readonly Scene[] = [
  {
    name: "pacman",
    duration: 2.4,
    spentWeight: 0,
    paint: (frame, t) => {
      const cx = sawtooth(t, 2.4) * (WIDTH + 8) - 4;
      // Chomping at nine hertz - fast enough to read as eating rather than as a
      // shape wobbling.
      const gape = Math.abs(Math.sin(t * 9)) * 0.95;

      // The dots he has not got to yet.
      for (let x = 0; x < WIDTH; x++) {
        if (x % 2 === 0 && x > cx + 2) frame.add(x, 3, scale(WHITE, 0.25));
      }

      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          if (Math.hypot(x - cx, y - 3.5) > 3.3) continue;
          // The wedge, opening towards where he is going.
          if (Math.abs(Math.atan2(y - 3.5, x - cx)) < gape) continue;

          frame.add(x, y, scale(STATUS_COLORS.waiting, 0.95));
        }
      }
    },
  },

  {
    name: "rain",
    duration: 2.6,
    spentWeight: 0,
    paint: (frame, t, _state, seed = 0) => {
      for (let x = 0; x < WIDTH; x++) {
        // A different speed and offset per column, so it never falls in step.
        const head = (t * (5 + (x % 4) * 2.5) + x * 2.7) % (HEIGHT + 4);

        for (let tail = 0; tail < 4; tail++) {
          frame.add(x, Math.floor(head) - tail, scale(hsv(seed + 0.33, 0.9, 1), 0.9 - tail * 0.22));
        }
      }
    },
  },

  {
    name: "wink",
    weight: 3,
    duration: 1.4,
    spentWeight: 0.5,
    paint: (frame, t, state) => {
      // Shut for the middle of it rather than throughout, so it reads as a wink
      // and not as a face with one eye.
      drawFace(frame, state.mood, STATUS_COLORS[state.status], { wink: t > 0.35 && t < 0.95 });
      drawGauges(frame, state);
    },
  },

  {
    name: "dart",
    weight: 3,
    duration: 1.3,
    spentWeight: 0.5,
    paint: (frame, t, state) => {
      // Eyes flicking far faster than the idle gaze - reads as a double take.
      drawFace(frame, state.mood, STATUS_COLORS[state.status], {
        gaze: [Math.round(Math.sin(t * 18)), 0],
      });
      drawGauges(frame, state);
    },
  },
];

export const ANTICS: readonly Scene[] = [
  {
    name: "dance",
    spentWeight: 0,
    duration: 2.6,
    paint: (frame, t, state) => {
      const beat = Math.sin(t * 7.5);

      drawFace(frame, state.mood, hsv(sawtooth(t, 1.4), 0.85, 1), {
        gaze: [beat > 0 ? 1 : -1, 0],
        bob: beat > 0.5 ? -1 : 0,
      });
      drawGauges(frame, state);
    },
  },

  {
    name: "spin",
    spentWeight: 0,
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
    spentWeight: 0,
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
    spentWeight: 0,
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
    spentWeight: 0.5,
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

  // Claude's own mark, so it comes round oftener than the rest.
  { ...glyphScene("burst", BURST, STATUS_COLORS.idle, 1.8), weight: 3, spentWeight: 0 },
  { ...glyphScene("bolt", BOLT, STATUS_COLORS.waiting, 1.4), spentWeight: 0 },
  { ...glyphScene("invader", INVADER, VIOLET, 1.8), spentWeight: 0 },
  {
    name: "ghost",
    duration: 3,
    weight: 3,
    spentWeight: 0.5,
    // Turning to face the other way partway through its run, so it drifts rather
    // than sits there. The glow is the same pulse every other glyph gets.
    paint: (frame, t) => {
      const facing = Math.floor(t / GHOST_TURN) % 2 === 1 ? mirrored(GHOST) : GHOST;

      drawGlyph(frame, facing, scale(WHITE, 0.35 + 0.65 * pulse(t, 0.5)));
    },
  },
  // These two belong to a session running out of room, so they get commoner as it
  // does rather than draining away with the playful ones.
  // Rare while there is room and the commonest thing once there is not.
  ...PLAYFUL,
];

// Scenes that mean something, and so are never picked at random. A directional
// sweep that turns up on its own reads as "you switched sessions" when nothing
// happened, which is worse than not having it.
const SWITCH_DURATION = 1.3;

// Three arrowheads rather than one arrow with a tail. Stacked they read as a
// direction - a queue of things heading somewhere - where the tail read as one
// object being dragged.
const SWITCH_HEADS = 3;
const SWITCH_SPACING = 3.2;
const SWITCH_DEPTH = 2;

// Never picked at random - a signal is played because something happened. The
// cross is here so a spent quota can be looked at on demand rather than only
// when a window actually runs out.
export const SIGNALS: readonly Scene[] = [
  glyphScene("cross", CROSS, STATUS_COLORS.error, 1.4),
  {
    name: "switch",
    duration: SWITCH_DURATION,
    // Left to right, then right to left, then back. Alternating says "it moved"
    // where one fixed direction eventually reads as decoration.
    mirrors: true,
    // A hand-over is the one event here about two things rather than one, so it
    // gets the whole panel rather than a corner of it.
    paint: (frame, t, _state, seed = 0, mirrored = false) => {
      // A different colour each time, so two switches in a row read as two
      // events. Status colour would be the obvious choice and is the wrong one:
      // it makes the sweep look like a state the panel is about to settle into.
      const color = hsv(seed, 0.85, 1);
      const middle = (HEIGHT - 1) / 2;
      // Starts with the leading head already on the panel and ends with the last
      // one clear of it, so no frame of the sweep is blank.
      const travel = WIDTH + SWITCH_HEADS * SWITCH_SPACING + SWITCH_DEPTH;
      const lead = 0.5 + sawtooth(t, SWITCH_DURATION) * travel;

      for (let head = 0; head < SWITCH_HEADS; head++) {
        // Each one dimmer than the one ahead of it, which is what gives the row
        // of them a direction rather than just a rhythm.
        const strength = 1 - head * 0.28;
        const origin = lead - head * SWITCH_SPACING;

        for (let y = 0; y < HEIGHT; y++) {
          // The point is a diagonal, so a head is an arrow rather than a bar.
          const tip = origin - Math.abs(y - middle);

          for (let depth = 0; depth < SWITCH_DEPTH; depth++) {
            const x = Math.round(tip - depth);

            frame.add(mirrored ? WIDTH - 1 - x : x, y, scale(color, strength * (1 - depth * 0.3)));
          }
        }
      }
    },
  },
];

const NAMED = [...ANTICS, ...SIGNALS];

/**
 * How likely an antic is to be picked, given how spent the window is.
 *
 * Interpolated rather than switched at a threshold, so the energetic scenes fade
 * out of the pool as it fills and the cross fades in - the pet winds down instead
 * of changing character in one step.
 */
export const anticWeight = (antic: Scene, fatigue: number): number => {
  const fresh = antic.weight ?? 1;

  return fresh + ((antic.spentWeight ?? fresh) - fresh) * fatigue;
};

export const anticNamed = (name: string): Scene | null =>
  NAMED.find((scene) => scene.name === name) ?? null;

export const ANTIC_NAMES = NAMED.map((scene) => scene.name);
