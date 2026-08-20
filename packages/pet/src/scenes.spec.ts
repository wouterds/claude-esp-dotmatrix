import { createFrame, HEIGHT, WIDTH } from "@claude-status/matrix";
import { describe, expect, it } from "vitest";
import {
  ANTICS,
  anticNamed,
  anticWeight,
  drawAlarm,
  drawBar,
  drawGauges,
  FIVE_HOUR_ROW,
  SIGNALS,
  STATUS_SCENE,
  WEEKLY_ROW,
} from "./scenes";
import { deriveMood, type PetState, STATUSES } from "./state";

const stateAt = (fill: number, status: PetState["status"] = "thinking"): PetState => ({
  status,
  mood: deriveMood(status, fill),
  fill,
  tokens: Math.round(fill * 200_000),
  waiting: 0,
  fiveHour: fill,
  sevenDay: fill,
});

const litInRow = (frame: ReturnType<typeof createFrame>, y: number) => {
  const lit: number[] = [];
  for (let x = 0; x < WIDTH; x++) {
    const [r, g, b] = frame.get(x, y);
    if (r || g || b) lit.push(x);
  }

  return lit;
};

// An accent moves, so one moment proves nothing about the row it crosses.
const MOMENTS = [0, 0.17, 0.4, 0.63, 0.9, 1.3, 2.1, 3.4, 5.5, 7.9, 11.3];

describe("drawBar", () => {
  it("lights nothing on an untouched quota", () => {
    const frame = createFrame();
    drawBar(frame, FIVE_HOUR_ROW, 0);

    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([]);
  });

  it("fills the row at the top of the quota", () => {
    const frame = createFrame();
    drawBar(frame, FIVE_HOUR_ROW, 1);

    expect(litInRow(frame, FIVE_HOUR_ROW).length).toBe(WIDTH);
  });

  it("lights half the row at half spent", () => {
    const frame = createFrame();
    drawBar(frame, FIVE_HOUR_ROW, 0.5);

    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([0, 1, 2, 3]);
  });

  it("dims the leading pixel by the fraction of it in use", () => {
    const half = createFrame();
    const full = createFrame();
    drawBar(half, FIVE_HOUR_ROW, 0.0625);
    drawBar(full, FIVE_HOUR_ROW, 0.125);

    expect(half.get(0, FIVE_HOUR_ROW)[1]).toBeLessThan(full.get(0, FIVE_HOUR_ROW)[1]);
  });

  it("stays green through the first half and reddens after three quarters", () => {
    const early = createFrame();
    const late = createFrame();
    drawBar(early, FIVE_HOUR_ROW, 0.4);
    drawBar(late, FIVE_HOUR_ROW, 1);

    const [earlyRed, earlyGreen] = early.get(0, FIVE_HOUR_ROW);
    const [lateRed, lateGreen] = late.get(0, FIVE_HOUR_ROW);

    expect(earlyGreen).toBeGreaterThan(earlyRed);
    expect(lateRed).toBeGreaterThan(lateGreen);
  });

  it("touches only the row it was given", () => {
    const frame = createFrame();
    drawBar(frame, WEEKLY_ROW, 1);

    for (let y = WEEKLY_ROW + 1; y < HEIGHT; y++) {
      expect(litInRow(frame, y), `row ${y}`).toEqual([]);
    }
  });

  // Position is the only thing telling the two rows apart, so the same figure
  // has to look identical on either - a difference here would read as a
  // different number rather than as a different window.
  it("draws the same pixels on either row for the same figure", () => {
    const top = createFrame();
    const bottom = createFrame();
    drawBar(top, WEEKLY_ROW, 0.62);
    drawBar(bottom, FIVE_HOUR_ROW, 0.62);

    for (let x = 0; x < WIDTH; x++) {
      expect(top.get(x, WEEKLY_ROW), `column ${x}`).toEqual(bottom.get(x, FIVE_HOUR_ROW));
    }
  });
});

describe("drawGauges", () => {
  it("puts the week on top and the five hour window on the bottom", () => {
    const frame = createFrame();
    drawGauges(frame, { ...stateAt(0), fiveHour: 0.25, sevenDay: 0.75 });

    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([0, 1]);
    expect(litInRow(frame, WEEKLY_ROW)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  // A row defaulting to empty would read as "none of it used", which is the one
  // wrong answer that looks like good news.
  it("leaves a quota nothing has reported dark rather than empty", () => {
    const frame = createFrame();
    drawGauges(frame, { ...stateAt(0.5), fiveHour: null, sevenDay: null });

    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([]);
    expect(litInRow(frame, WEEKLY_ROW)).toEqual([]);
  });

  it("draws the one it knows when the other is missing", () => {
    const frame = createFrame();
    drawGauges(frame, { ...stateAt(0), fiveHour: 0.5, sevenDay: null });

    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([0, 1, 2, 3]);
    expect(litInRow(frame, WEEKLY_ROW)).toEqual([]);
  });

  // The face reddens and slows on the context window, which is per session; the
  // two bars are account-wide. Crossing them would put one chat's fill on a row
  // that is meant to be the same number in every chat.
  it("takes no notice of the context fill the face runs on", () => {
    const frame = createFrame();
    drawGauges(frame, { ...stateAt(1), fiveHour: 0.125, sevenDay: 0.125 });

    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([0]);
    expect(litInRow(frame, WEEKLY_ROW)).toEqual([0]);
  });
});

describe("STATUS_SCENE", () => {
  it("never lets an accent shorten either bar, in any status at any moment", () => {
    // The spinner crosses the whole edge, both number rows included, on purpose -
    // so the guarantee is not that they are left alone but that they only ever
    // get brighter. A bar something could eat into would read as a smaller
    // number, and these two rows are the only things here that have to be true.
    for (const row of [WEEKLY_ROW, FIVE_HOUR_ROW]) {
      for (const status of STATUSES) {
        for (const t of MOMENTS) {
          const alone = createFrame();
          drawBar(alone, row, 0.5);

          const together = createFrame();
          STATUS_SCENE.paint(together, t, stateAt(0.5, status));

          expect(
            litInRow(together, row).length,
            `row ${row}, ${status} at ${t}`,
          ).toBeGreaterThanOrEqual(litInRow(alone, row).length);
        }
      }
    }
  });

  // On a status with no accent of its own, so this is the bars alone. The
  // statuses that do have one cross the edge deliberately, and what holds for
  // those is the "never shorten" guarantee above rather than an exact length.
  it("shows both quotas alongside the face", () => {
    const frame = createFrame();
    STATUS_SCENE.paint(frame, 0.5, { ...stateAt(0.2, "done"), fiveHour: 0.75, sevenDay: 0.5 });

    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(litInRow(frame, WEEKLY_ROW)).toEqual([0, 1, 2, 3]);
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

describe("drawAlarm", () => {
  const cornerOver = (waiting: number) => {
    // Sampled across a blink so the "on" half is always caught.
    const seen: string[] = [];
    for (let step = 0; step < 20; step++) {
      const frame = createFrame();
      drawAlarm(frame, waiting, step * 0.03);

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

  it("is no part of the status scene, so an antic cannot hide it", () => {
    const frame = createFrame();
    STATUS_SCENE.paint(frame, 0, { ...stateAt(0.2, "working"), waiting: 3 });

    expect(frame.get(WIDTH - 1, 0)).toEqual([0, 0, 0]);
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

  const commonest = (fatigue: number) =>
    [...ANTICS].sort((a, b) => anticWeight(b, fatigue) - anticWeight(a, fatigue))[0].name;

  // Asserted against each other rather than as percentages. A share depends on
  // how many antics exist, so adding one used to break these; which one is
  // likeliest is the actual intent.
  it("makes the cross the likeliest single antic once there is no room left", () => {
    expect(commonest(1)).toBe("cross");
  });

  it("makes hearts the likeliest while there is room", () => {
    expect(commonest(0)).toBe("heart");
  });

  it("hands the pool over to the grim ones as the window empties", () => {
    const grim = ["cross", "skull", "zzz"];
    const shareOfGrim = (fatigue: number) => {
      const total = ANTICS.reduce((sum, antic) => sum + anticWeight(antic, fatigue), 0);

      return (
        ANTICS.filter((antic) => grim.includes(antic.name)).reduce(
          (sum, antic) => sum + anticWeight(antic, fatigue),
          0,
        ) / total
      );
    };

    expect(shareOfGrim(0)).toBeLessThan(0.1);
    expect(shareOfGrim(1)).toBeGreaterThan(0.5);
  });

  it("keeps hearts commoner with room than without", () => {
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
