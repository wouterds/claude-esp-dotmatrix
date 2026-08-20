import { createFrame, HEIGHT, WIDTH } from "@claude-status/matrix";
import { describe, expect, it } from "vitest";
import { ANTICS, anticNamed, anticWeight, drawGauge, SIGNALS, STATUS_SCENE } from "./scenes";
import { deriveMood, type PetState, STATUSES } from "./state";

const stateAt = (fill: number, status: PetState["status"] = "thinking"): PetState => ({
  status,
  mood: deriveMood(status, fill),
  fill,
  tokens: Math.round(fill * 200_000),
  waiting: 0,
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

describe("the waiting dot", () => {
  const cornerOver = (waiting: number) => {
    // Sampled across a blink so the "on" half is always caught.
    const seen: string[] = [];
    for (let step = 0; step < 20; step++) {
      const frame = createFrame();
      STATUS_SCENE.paint(frame, step * 0.03, { ...stateAt(0.2, "working"), waiting });

      const [r, g, b] = frame.get(WIDTH - 1, 0);
      if (r || g || b) seen.push(`${r},${g},${b}`);
    }

    return seen;
  };

  it("stays dark when nothing is waiting", () => {
    expect(cornerOver(0)).toEqual([]);
  });

  it("lights for one chat, and blinks rather than holding", () => {
    const seen = cornerOver(1);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThan(20);
  });

  it("escalates yellow, orange, red as chats pile up", () => {
    const [one] = cornerOver(1);
    const [two] = cornerOver(2);
    const [many] = cornerOver(4);

    expect(new Set([one, two, many]).size).toBe(3);

    // Reddening: less green each step, which is what makes it read as escalation
    // rather than as three arbitrary colours.
    const green = (colour: string) => Number(colour.split(",")[1]);
    expect(green(two)).toBeLessThan(green(one));
    expect(green(many)).toBeLessThan(green(two));
  });

  it("caps at red however many are waiting", () => {
    expect(cornerOver(3)[0]).toBe(cornerOver(9)[0]);
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

describe("anticWeight", () => {
  const named = (name: string) => ANTICS.find((antic) => antic.name === name)!;

  const shareOf = (name: string, fatigue: number) => {
    const total = ANTICS.reduce((sum, antic) => sum + anticWeight(antic, fatigue), 0);

    return anticWeight(named(name), fatigue) / total;
  };

  it("drains the energetic scenes out of the pool as the window fills", () => {
    for (const name of ["dance", "spin", "wave", "rainbow", "bolt", "burst"]) {
      expect(anticWeight(named(name), 0), name).toBeGreaterThan(0);
      expect(anticWeight(named(name), 1), name).toBe(0);
    }
  });

  it("makes the cross the commonest thing once there is no room left", () => {
    expect(shareOf("cross", 0)).toBeLessThan(0.1);
    expect(shareOf("cross", 1)).toBeGreaterThan(0.5);
  });

  it("keeps hearts frequent while there is room and rarer once there is not", () => {
    expect(shareOf("heart", 0)).toBeGreaterThan(0.25);
    expect(shareOf("heart", 1)).toBeLessThan(shareOf("heart", 0));
  });

  it("never goes negative, whatever the fatigue", () => {
    for (const fatigue of [0, 0.25, 0.5, 0.75, 1]) {
      for (const antic of ANTICS) {
        expect(anticWeight(antic, fatigue), `${antic.name} at ${fatigue}`).toBeGreaterThanOrEqual(
          0,
        );
      }
    }
  });

  it("always leaves something to pick", () => {
    for (const fatigue of [0, 0.5, 1]) {
      const total = ANTICS.reduce((sum, antic) => sum + anticWeight(antic, fatigue), 0);

      expect(total, `fatigue ${fatigue}`).toBeGreaterThan(0);
    }
  });
});

describe("anticNamed", () => {
  it("finds one by name and returns null for anything else", () => {
    expect(anticNamed("heart")?.name).toBe("heart");
    expect(anticNamed("floss")).toBeNull();
  });
});
