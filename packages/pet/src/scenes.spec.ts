import { createFrame, HEIGHT, WIDTH } from "@claude-status/matrix";
import { describe, expect, it } from "vitest";
import { ANTICS, anticNamed, drawGauge, SIGNALS, STATUS_SCENE } from "./scenes";
import { deriveMood, type PetState, STATUSES } from "./state";

const stateAt = (fill: number, status: PetState["status"] = "thinking"): PetState => ({
  status,
  mood: deriveMood(status, fill),
  fill,
  tokens: Math.round(fill * 200_000),
  attention: false,
});

const litInRow = (frame: ReturnType<typeof createFrame>, y: number) => {
  const lit: number[] = [];
  for (let x = 0; x < WIDTH; x++) {
    const [r, g, b] = frame.get(x, y);
    if (r || g || b) lit.push(x);
  }

  return lit;
};

const GAUGE_ROW = HEIGHT - 1;

// An accent moves, so one moment proves nothing about the row it crosses.
const MOMENTS = [0, 0.17, 0.4, 0.63, 0.9, 1.3, 2.1, 3.4, 5.5, 7.9, 11.3];

describe("drawGauge", () => {
  it("lights nothing on an empty window", () => {
    const frame = createFrame();
    drawGauge(frame, 0);

    expect(litInRow(frame, GAUGE_ROW)).toEqual([]);
  });

  it("fills the row at the top of the window", () => {
    const frame = createFrame();
    drawGauge(frame, 1);

    expect(litInRow(frame, GAUGE_ROW).length).toBe(WIDTH);
  });

  it("lights half the row at half full", () => {
    const frame = createFrame();
    drawGauge(frame, 0.5);

    expect(litInRow(frame, GAUGE_ROW)).toEqual([0, 1, 2, 3]);
  });

  it("dims the leading pixel by the fraction of it in use", () => {
    const half = createFrame();
    const full = createFrame();
    drawGauge(half, 0.0625);
    drawGauge(full, 0.125);

    expect(half.get(0, GAUGE_ROW)[1]).toBeLessThan(full.get(0, GAUGE_ROW)[1]);
  });

  it("stays green through the first half and reddens after three quarters", () => {
    const early = createFrame();
    const late = createFrame();
    drawGauge(early, 0.4);
    drawGauge(late, 1);

    const [earlyRed, earlyGreen] = early.get(0, GAUGE_ROW);
    const [lateRed, lateGreen] = late.get(0, GAUGE_ROW);

    expect(earlyGreen).toBeGreaterThan(earlyRed);
    expect(lateRed).toBeGreaterThan(lateGreen);
  });

  it("touches only the bottom row", () => {
    const frame = createFrame();
    drawGauge(frame, 1);

    for (let y = 0; y < GAUGE_ROW; y++) {
      expect(litInRow(frame, y), `row ${y}`).toEqual([]);
    }
  });
});

describe("STATUS_SCENE", () => {
  it("never lets an accent shorten the gauge, in any status at any moment", () => {
    // The spinner crosses the whole edge, the gauge row included, on purpose - so
    // the guarantee is not that the row is left alone but that it only ever gets
    // brighter. A bar something could eat into would read as a smaller number.
    for (const status of STATUSES) {
      for (const t of MOMENTS) {
        const alone = createFrame();
        drawGauge(alone, 0.5);

        const together = createFrame();
        STATUS_SCENE.paint(together, t, stateAt(0.5, status));

        expect(litInRow(together, GAUGE_ROW).length, `${status} at ${t}`).toBeGreaterThanOrEqual(
          litInRow(alone, GAUGE_ROW).length,
        );
      }
    }
  });

  it("shows the fill on the gauge row alongside the face", () => {
    const frame = createFrame();
    STATUS_SCENE.paint(frame, 0.5, stateAt(0.75));

    expect(litInRow(frame, GAUGE_ROW)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("lights something in every status - a dark panel reads as unplugged", () => {
    for (const status of STATUSES) {
      for (const t of MOMENTS) {
        const frame = createFrame();
        STATUS_SCENE.paint(frame, t, stateAt(0.3, status));

        const anything = Array.from({ length: HEIGHT }, (_, y) => litInRow(frame, y).length);

        expect(
          anything.reduce((total, count) => total + count, 0),
          `${status} at ${t}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("runs until replaced rather than expiring", () => {
    expect(STATUS_SCENE.duration).toBeNull();
  });
});

describe("ANTICS", () => {
  it("all end, or the pet would never return to showing status", () => {
    for (const antic of [...ANTICS, ...SIGNALS]) {
      expect(antic.duration, antic.name).toBeGreaterThan(0);
      expect(antic.duration, antic.name).toBeLessThan(10);
    }
  });

  it("all light something across their run", () => {
    for (const antic of [...ANTICS, ...SIGNALS]) {
      for (const fraction of [0.05, 0.35, 0.7]) {
        const frame = createFrame();
        antic.paint(frame, antic.duration! * fraction, stateAt(0.4, "idle"));

        const total = Array.from({ length: HEIGHT }, (_, y) => litInRow(frame, y).length).reduce(
          (sum, count) => sum + count,
          0,
        );

        expect(total, `${antic.name} at ${fraction}`).toBeGreaterThan(0);
      }
    }
  });

  it("have distinct names, since that is how one is asked for", () => {
    const names = [...ANTICS, ...SIGNALS].map((scene) => scene.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it("keep signals out of the random pool, so a sweep always means something", () => {
    const pool = ANTICS.map((antic) => antic.name);

    for (const signal of SIGNALS) {
      expect(pool, signal.name).not.toContain(signal.name);
    }
  });

  it("still let a signal be asked for by name", () => {
    expect(anticNamed("switch")?.name).toBe("switch");
  });

  it("paint the same pixels for the same moment, twinkle included", () => {
    const once = createFrame();
    const again = createFrame();
    anticNamed("twinkle")?.paint(once, 1.1, stateAt(0.4));
    anticNamed("twinkle")?.paint(again, 1.1, stateAt(0.4));

    expect(once.toBytes()).toEqual(again.toBytes());
  });

  it("move on - twinkle at a later step is a different sky", () => {
    const early = createFrame();
    const later = createFrame();
    anticNamed("twinkle")?.paint(early, 0.1, stateAt(0.4));
    anticNamed("twinkle")?.paint(later, 1.9, stateAt(0.4));

    expect(early.toBytes()).not.toEqual(later.toBytes());
  });
});

describe("anticNamed", () => {
  it("finds one by name and returns null for anything else", () => {
    expect(anticNamed("heart")?.name).toBe("heart");
    expect(anticNamed("floss")).toBeNull();
  });
});
