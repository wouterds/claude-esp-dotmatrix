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

const litEverywhere = (frame: ReturnType<typeof createFrame>) =>
  Array.from({ length: HEIGHT }, (_, y) => litInRow(frame, y).length).reduce(
    (total, count) => total + count,
    0,
  );

// An accent moves, so one moment proves nothing about the row it crosses.
const MOMENTS = [0, 0.17, 0.4, 0.63, 0.9, 1.3, 2.1, 3.4, 5.5, 7.9, 11.3];

describe("drawBar", () => {
  it("still lights one pixel on an untouched quota, and it is green", () => {
    // given - dark means "nothing has reported this", and only that. An empty
    // quota is a fact worth showing, so it gets the smallest bar there is rather
    // than the same blank row as no reading at all.
    const frame = createFrame();

    // when
    drawBar(frame, FIVE_HOUR_ROW, 0);

    // then
    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([0]);

    const [red, green] = frame.get(0, FIVE_HOUR_ROW);
    expect(green).toBeGreaterThan(red);
  });

  it("never drops below that one pixel, however small the figure", () => {
    // given
    const slivers = [0, 0.0001, 0.01, 0.05, 0.124];

    // when / then - the sweep is the action, so it carries its own assertion
    for (const used of slivers) {
      const frame = createFrame();
      drawBar(frame, FIVE_HOUR_ROW, used);

      expect(litInRow(frame, FIVE_HOUR_ROW), `used ${used}`).toEqual([0]);
    }
  });

  it("fills the row at the top of the quota", () => {
    // given
    const frame = createFrame();

    // when
    drawBar(frame, FIVE_HOUR_ROW, 1);

    // then
    expect(litInRow(frame, FIVE_HOUR_ROW).length).toBe(WIDTH);
  });

  it("lights half the row at half spent", () => {
    // given
    const frame = createFrame();

    // when
    drawBar(frame, FIVE_HOUR_ROW, 0.5);

    // then
    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([0, 1, 2, 3]);
  });

  it("dims the leading pixel by the fraction of it in use", () => {
    // given - measured on the second pixel rather than the first, because the
    // first is held at a whole pixel by the floor and has nothing left to dim.
    const half = createFrame();
    const full = createFrame();

    // when
    drawBar(half, FIVE_HOUR_ROW, 0.1875);
    drawBar(full, FIVE_HOUR_ROW, 0.25);

    // then
    expect(half.get(1, FIVE_HOUR_ROW)[1]).toBeLessThan(full.get(1, FIVE_HOUR_ROW)[1]);
  });

  it("stays green through the first half and reddens after three quarters", () => {
    // given
    const early = createFrame();
    const late = createFrame();

    // when
    drawBar(early, FIVE_HOUR_ROW, 0.4);
    drawBar(late, FIVE_HOUR_ROW, 1);

    // then
    const [earlyRed, earlyGreen] = early.get(0, FIVE_HOUR_ROW);
    const [lateRed, lateGreen] = late.get(0, FIVE_HOUR_ROW);
    expect(earlyGreen).toBeGreaterThan(earlyRed);
    expect(lateRed).toBeGreaterThan(lateGreen);
  });

  it("touches only the row it was given", () => {
    // given
    const frame = createFrame();

    // when
    drawBar(frame, WEEKLY_ROW, 1);

    // then
    for (let y = WEEKLY_ROW + 1; y < HEIGHT; y++) {
      expect(litInRow(frame, y), `row ${y}`).toEqual([]);
    }
  });

  it("draws the same pixels on either row for the same figure", () => {
    // given - position is the only thing telling the two rows apart, so the same
    // figure has to look identical on either. A difference would read as a
    // different number rather than as a different window.
    const top = createFrame();
    const bottom = createFrame();

    // when
    drawBar(top, WEEKLY_ROW, 0.62);
    drawBar(bottom, FIVE_HOUR_ROW, 0.62);

    // then
    for (let x = 0; x < WIDTH; x++) {
      expect(top.get(x, WEEKLY_ROW), `column ${x}`).toEqual(bottom.get(x, FIVE_HOUR_ROW));
    }
  });
});

describe("drawGauges", () => {
  it("puts the week on top and the five hour window on the bottom", () => {
    // given
    const frame = createFrame();

    // when
    drawGauges(frame, { ...stateAt(0), fiveHour: 0.25, sevenDay: 0.75 });

    // then
    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([0, 1]);
    expect(litInRow(frame, WEEKLY_ROW)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("leaves a quota nothing has reported dark rather than empty", () => {
    // given - a row defaulting to empty would read as "none of it used", which is
    // the one wrong answer that looks like good news.
    const frame = createFrame();

    // when
    drawGauges(frame, { ...stateAt(0.5), fiveHour: null, sevenDay: null });

    // then
    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([]);
    expect(litInRow(frame, WEEKLY_ROW)).toEqual([]);
  });

  it("tells an empty quota apart from an unknown one", () => {
    // given - the pair that makes a dark row unambiguous. Without the floor, a
    // fresh window and a broken statusline are the same picture.
    const empty = createFrame();
    const unknown = createFrame();

    // when
    drawGauges(empty, { ...stateAt(0.5), fiveHour: 0, sevenDay: 0 });
    drawGauges(unknown, { ...stateAt(0.5), fiveHour: null, sevenDay: null });

    // then
    expect(litInRow(empty, FIVE_HOUR_ROW)).toEqual([0]);
    expect(litInRow(empty, WEEKLY_ROW)).toEqual([0]);
    expect(litInRow(unknown, FIVE_HOUR_ROW)).toEqual([]);
    expect(litInRow(unknown, WEEKLY_ROW)).toEqual([]);
  });

  it("draws the one it knows when the other is missing", () => {
    // given
    const frame = createFrame();

    // when
    drawGauges(frame, { ...stateAt(0), fiveHour: 0.5, sevenDay: null });

    // then
    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([0, 1, 2, 3]);
    expect(litInRow(frame, WEEKLY_ROW)).toEqual([]);
  });

  it("takes no notice of the context fill the face runs on", () => {
    // given - the face reddens and slows on the context window, which is per
    // session; the two bars are account-wide. Crossing them would put one chat's
    // fill on a row meant to be the same number in every chat.
    const frame = createFrame();

    // when
    drawGauges(frame, { ...stateAt(1), fiveHour: 0.125, sevenDay: 0.125 });

    // then
    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([0]);
    expect(litInRow(frame, WEEKLY_ROW)).toEqual([0]);
  });
});

describe("STATUS_SCENE", () => {
  it("never lets an accent shorten either bar, in any status at any moment", () => {
    // given - the spinner crosses the whole edge, both number rows included, on
    // purpose. The guarantee is not that they are left alone but that they only
    // ever get brighter: a bar something could eat into would read as a smaller
    // number, and these two rows are the only things here that have to be true.
    const cases = [WEEKLY_ROW, FIVE_HOUR_ROW].flatMap((row) =>
      STATUSES.flatMap((status) => MOMENTS.map((t) => ({ row, status, t }))),
    );

    // when / then - the sweep is the action, so it carries its own assertion
    for (const { row, status, t } of cases) {
      const alone = createFrame();
      drawBar(alone, row, 0.5);

      const together = createFrame();
      STATUS_SCENE.paint(together, t, stateAt(0.5, status));

      expect(
        litInRow(together, row).length,
        `row ${row}, ${status} at ${t}`,
      ).toBeGreaterThanOrEqual(litInRow(alone, row).length);
    }
  });

  it("shows both quotas alongside the face", () => {
    // given - a status with no accent of its own, so this is the bars alone. The
    // statuses that do have one cross the edge deliberately, and what holds for
    // those is the "never shorten" guarantee above rather than an exact length.
    const frame = createFrame();

    // when
    STATUS_SCENE.paint(frame, 0.5, { ...stateAt(0.2, "done"), fiveHour: 0.75, sevenDay: 0.5 });

    // then
    expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(litInRow(frame, WEEKLY_ROW)).toEqual([0, 1, 2, 3]);
  });

  it("lights something in every status - a dark panel reads as unplugged", () => {
    // given
    const cases = STATUSES.flatMap((status) => MOMENTS.map((t) => ({ status, t })));

    // when / then - the sweep is the action, so it carries its own assertion
    for (const { status, t } of cases) {
      const frame = createFrame();
      STATUS_SCENE.paint(frame, t, stateAt(0.3, status));

      expect(litEverywhere(frame), `${status} at ${t}`).toBeGreaterThan(0);
    }
  });

  it("runs until replaced rather than expiring", () => {
    // given
    const scene = STATUS_SCENE;

    // when
    const { duration } = scene;

    // then
    expect(duration).toBeNull();
  });
});

describe("a spent quota", () => {
  const at = (fiveHour: number, sevenDay: number): PetState => ({
    ...stateAt(0.3, "thinking"),
    fiveHour,
    sevenDay,
  });

  // t=0 falls in the cross half of the alternation, t=3 in the face half.
  const painted = (state: PetState, t: number) => {
    const frame = createFrame();
    STATUS_SCENE.paint(frame, t, state);

    return frame;
  };

  it("takes the panel over when either window runs out, and not before", () => {
    // given
    const roomy = at(0.99, 0.99);
    const outOfFive = at(1, 0.99);
    const outOfWeek = at(0.99, 1);

    // when
    const [ordinary, five, week] = [roomy, outOfFive, outOfWeek].map((state) =>
      painted(state, 0).toBytes().join(","),
    );

    // then - either window doing it, and both drawing the same thing, because at
    // this point which one ran out is not what the panel is saying
    expect(five).not.toBe(ordinary);
    expect(week).toBe(five);
  });

  it("alternates rather than holding either half, so it cannot read as a crash", () => {
    // given
    const spent = at(1, 0.5);

    // when
    const [cross, face] = [painted(spent, 0), painted(spent, 3)];

    // then
    expect(litEverywhere(cross)).toBeGreaterThan(litEverywhere(face));
    expect(cross.toBytes()).not.toEqual(face.toBytes());
  });

  it("brings the bars back with the face, so which window ran out stays readable", () => {
    // given
    const spent = at(1, 0.5);

    // when
    const frame = painted(spent, 3);

    // then
    expect(litInRow(frame, FIVE_HOUR_ROW).length).toBe(WIDTH);
    expect(litInRow(frame, WEEKLY_ROW)).toEqual([0, 1, 2, 3]);
  });

  it("gives the row that ran out the cross's red rather than the top gauge band", () => {
    // given - the band tops out at a warm orange that reads as "nearly", and a
    // window with nothing left in it is past nearly.
    const spent = at(1, 0.5);

    // when
    const frame = painted(spent, 3);

    // then
    const [spentRed, spentGreen] = frame.get(0, FIVE_HOUR_ROW);
    const [, weeklyGreen] = frame.get(0, WEEKLY_ROW);
    expect(spentRed).toBeGreaterThan(spentGreen);
    expect(spentGreen).toBeLessThan(weeklyGreen);
  });

  it("leaves a row that still has room in its own band", () => {
    // given
    const spent = at(1, 0.2);

    // when
    const frame = painted(spent, 3);

    // then - green, because a fifth of the week is still the green band
    const [red, green] = frame.get(0, WEEKLY_ROW);
    expect(green).toBeGreaterThan(red);
  });
});

describe("drawAlarm", () => {
  // Sampled across a blink so the "on" half is always caught.
  const cornerOver = (waiting: number) => {
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
    // given
    const nothingWaiting = 0;

    // when
    const seen = cornerOver(nothingWaiting);

    // then
    expect(seen).toEqual([]);
  });

  it("lights for one chat, and blinks rather than holding", () => {
    // given
    const oneWaiting = 1;

    // when
    const seen = cornerOver(oneWaiting);

    // then
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThan(20);
  });

  it("escalates yellow, orange, red as chats pile up", () => {
    // given
    const pilingUp = [1, 2, 4];

    // when
    const [one, two, many] = pilingUp.map((waiting) => cornerOver(waiting)[0]);

    // then - reddening: less green each step, which is what makes it read as
    // escalation rather than as three arbitrary colours.
    const green = (colour: string) => Number(colour.split(",")[1]);
    expect(new Set([one, two, many]).size).toBe(3);
    expect(green(two)).toBeLessThan(green(one));
    expect(green(many)).toBeLessThan(green(two));
  });

  it("caps at red however many are waiting", () => {
    // given
    const atTheCap = [3, 9];

    // when
    const [three, nine] = atTheCap.map((waiting) => cornerOver(waiting)[0]);

    // then
    expect(nine).toBe(three);
  });

  it("is no part of the status scene, so an antic cannot hide it", () => {
    // given
    const frame = createFrame();

    // when
    STATUS_SCENE.paint(frame, 0, { ...stateAt(0.2, "working"), waiting: 3 });

    // then
    expect(frame.get(WIDTH - 1, 0)).toEqual([0, 0, 0]);
  });
});

describe("ANTICS", () => {
  it("all end, or the pet would never return to showing status", () => {
    // given
    const every = [...ANTICS, ...SIGNALS];

    // when
    const durations = every.map((antic) => ({ name: antic.name, duration: antic.duration }));

    // then
    for (const { name, duration } of durations) {
      expect(duration, name).toBeGreaterThan(0);
      expect(duration, name).toBeLessThan(10);
    }
  });

  it("all light something across their run", () => {
    // given
    const every = [...ANTICS, ...SIGNALS];
    const cases = every.flatMap((antic) =>
      [0.05, 0.35, 0.7].map((fraction) => ({ antic, fraction })),
    );

    // when / then - the sweep is the action, so it carries its own assertion
    for (const { antic, fraction } of cases) {
      const frame = createFrame();
      antic.paint(frame, antic.duration! * fraction, stateAt(0.4, "idle"));

      expect(litEverywhere(frame), `${antic.name} at ${fraction}`).toBeGreaterThan(0);
    }
  });

  it("have distinct names, since that is how one is asked for", () => {
    // given
    const every = [...ANTICS, ...SIGNALS];

    // when
    const names = every.map((scene) => scene.name);

    // then
    expect(new Set(names).size).toBe(names.length);
  });

  it("keep signals out of the random pool, so a sweep always means something", () => {
    // given
    const pool = ANTICS.map((antic) => antic.name);

    // when
    const leaked = SIGNALS.filter((signal) => pool.includes(signal.name));

    // then
    expect(leaked.map((signal) => signal.name)).toEqual([]);
  });

  it("still let a signal be asked for by name", () => {
    // given
    const signal = "switch";

    // when
    const found = anticNamed(signal);

    // then
    expect(found?.name).toBe("switch");
  });

  it("paint the same pixels for the same moment, twinkle included", () => {
    // given
    const once = createFrame();
    const again = createFrame();

    // when
    anticNamed("twinkle")?.paint(once, 1.1, stateAt(0.4));
    anticNamed("twinkle")?.paint(again, 1.1, stateAt(0.4));

    // then
    expect(once.toBytes()).toEqual(again.toBytes());
  });

  it("move on - twinkle at a later step is a different sky", () => {
    // given
    const early = createFrame();
    const later = createFrame();

    // when
    anticNamed("twinkle")?.paint(early, 0.1, stateAt(0.4));
    anticNamed("twinkle")?.paint(later, 1.9, stateAt(0.4));

    // then
    expect(early.toBytes()).not.toEqual(later.toBytes());
  });
});

describe("anticWeight", () => {
  const named = (name: string) => ANTICS.find((antic) => antic.name === name)!;

  const commonest = (fatigue: number) =>
    [...ANTICS].sort((a, b) => anticWeight(b, fatigue) - anticWeight(a, fatigue))[0].name;

  it("drains the energetic scenes out of the pool as the window fills", () => {
    // given
    const energetic = ["dance", "spin", "wave", "rainbow", "bolt", "burst"];

    // when
    const weights = energetic.map((name) => ({
      name,
      fresh: anticWeight(named(name), 0),
      spent: anticWeight(named(name), 1),
    }));

    // then
    for (const { name, fresh, spent } of weights) {
      expect(fresh, name).toBeGreaterThan(0);
      expect(spent, name).toBe(0);
    }
  });

  it("keeps the cross out of the pool entirely, since it now means one thing", () => {
    // given
    const pool = ANTICS.map((antic) => antic.name);

    // when
    const found = pool.includes("cross");

    // then
    expect(found).toBe(false);
  });

  it("makes the ghost the likeliest while there is room", () => {
    // given - which one leads matters less than that it is not a grim one.
    const fresh = 0;

    // when
    const likeliest = commonest(fresh);

    // then
    expect(likeliest).toBe("ghost");
  });

  it("never goes negative, whatever the fatigue", () => {
    // given
    const cases = [0, 0.25, 0.5, 0.75, 1].flatMap((fatigue) =>
      ANTICS.map((antic) => ({ antic, fatigue })),
    );

    // when / then - the sweep is the action, so it carries its own assertion
    for (const { antic, fatigue } of cases) {
      expect(anticWeight(antic, fatigue), `${antic.name} at ${fatigue}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("always leaves something to pick", () => {
    // given
    const fatigues = [0, 0.5, 1];

    // when
    const totals = fatigues.map((fatigue) => ({
      fatigue,
      total: ANTICS.reduce((sum, antic) => sum + anticWeight(antic, fatigue), 0),
    }));

    // then
    for (const { fatigue, total } of totals) {
      expect(total, `fatigue ${fatigue}`).toBeGreaterThan(0);
    }
  });
});

describe("anticNamed", () => {
  it("finds one by name and returns null for anything else", () => {
    // given
    const names = ["twinkle", "floss"];

    // when
    const [known, unknown] = names.map(anticNamed);

    // then
    expect(known?.name).toBe("twinkle");
    expect(unknown).toBeNull();
  });
});
