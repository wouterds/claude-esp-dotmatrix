import { createFrame } from "@claude-status/matrix";
import { describe, expect, it } from "vitest";
import { createDirector } from "./director";
import type { PetState } from "./state";

const state = (status: PetState["status"] = "thinking"): PetState => ({
  status,
  mood: "focused",
  fill: 0.3,
  tokens: 60_000,
  waiting: 0,
  fiveHour: 0.3,
  sevenDay: 0.3,
});

// 0 puts the next antic at half the mean, which is the soonest it schedules.
const director = (interval: number, random = () => 0) => createDirector({ interval, random });

describe("createDirector", () => {
  it("shows status until an antic is due", () => {
    const pet = director(10);

    pet.paint(createFrame(), 0, state());
    expect(pet.playing()).toBe("status");

    // With room left in the window the interval is scaled down, so the soonest
    // an antic can land is 0.5 * 0.6 of the mean.
    pet.paint(createFrame(), 2.9, state());
    expect(pet.playing()).toBe("status");

    pet.paint(createFrame(), 3.1, state());
    expect(pet.playing()).not.toBe("status");
  });

  it("returns to status when the antic runs out", () => {
    const pet = director(10);
    pet.paint(createFrame(), 0, state());
    pet.paint(createFrame(), 3.1, state());

    expect(pet.playing()).not.toBe("status");

    // After the longest antic ends and before the next is due at 6.1.
    pet.paint(createFrame(), 5.9, state());
    expect(pet.playing()).toBe("status");
  });

  it("plays up more often with room left than with none", () => {
    const fresh = director(100);
    const spent = director(100);
    const spentState = { ...state(), fill: 1 };

    fresh.paint(createFrame(), 0, state());
    spent.paint(createFrame(), 0, spentState);

    // Same mean, same rolls: the fresh one is due at 30s, the spent one at 150s.
    fresh.paint(createFrame(), 31, state());
    spent.paint(createFrame(), 31, spentState);

    expect(fresh.playing()).not.toBe("status");
    expect(spent.playing()).toBe("status");
  });

  it("never interrupts an error - a red flashing face is the message", () => {
    const pet = director(1);

    for (const t of [0, 1, 2, 5, 20, 100]) {
      pet.paint(createFrame(), t, state("error"));
      expect(pet.playing(), `error at ${t}`).toBe("status");
    }
  });

  it("does keep playing up while a session is waiting", () => {
    // Claude Code raises a notification after a minute idle, so waiting is the
    // ordinary state of a pet sat on a desk. Suppressing antics through it left
    // the panel still exactly when there was most reason for it not to be.
    const pet = director(10);

    pet.paint(createFrame(), 0, state("waiting"));
    pet.paint(createFrame(), 3.1, state("waiting"));

    expect(pet.playing()).not.toBe("status");
  });

  it("keeps the waiting dot lit through an antic", () => {
    const pet = director(10);
    const waiting = { ...state("working"), waiting: 2 };

    pet.paint(createFrame(), 0, waiting);

    // Across a blink, during an antic, the corner still lights.
    const lit = Array.from({ length: 20 }, (_, step) => {
      const frame = createFrame();
      pet.paint(frame, 3.1 + step * 0.03, waiting);

      return frame.get(7, 0).some((v) => v > 0);
    });

    expect(pet.playing()).not.toBe("status");
    expect(lit.some(Boolean)).toBe(true);
  });

  it("drops whatever is playing the moment something needs acting on", () => {
    const pet = director(10);
    pet.paint(createFrame(), 0, state());
    pet.paint(createFrame(), 3.1, state());
    expect(pet.playing()).not.toBe("status");

    pet.paint(createFrame(), 3.2, state("error"));
    expect(pet.playing()).toBe("status");
  });

  it("ticks on arriving at done, rather than waiting for the next antic", () => {
    const pet = director(600);
    pet.paint(createFrame(), 0, state());
    expect(pet.playing()).toBe("status");

    pet.paint(createFrame(), 1, state("done"));
    expect(pet.playing()).toBe("check");
  });

  it("only celebrates the arrival, not every frame of it", () => {
    const pet = director(600);
    pet.paint(createFrame(), 0, state("done"));
    pet.paint(createFrame(), 30, state("done"));

    expect(pet.playing()).toBe("status");
  });

  it("turns a mirroring scene round each time it plays", () => {
    const pet = director(600);

    const sweep = (at: number) => {
      pet.play("switch", at);

      const frame = createFrame();
      pet.paint(frame, at + 0.5, state());

      return frame.toBytes().join(",");
    };

    const first = sweep(0);
    const second = sweep(10);
    const third = sweep(20);

    expect(second).not.toBe(first);
    expect(third).toBe(first);
  });

  it("does not turn round scenes that have no direction", () => {
    const pet = director(600);

    const play = (at: number) => {
      pet.play("heart", at);

      const frame = createFrame();
      pet.paint(frame, at + 0.5, state());

      return frame.toBytes().join(",");
    };

    expect(play(10)).toBe(play(0));
  });

  it("plays one on demand and reports an unknown name rather than guessing", () => {
    const pet = director(600);

    expect(pet.play("heart", 0)).toBe(true);
    pet.paint(createFrame(), 0, state());
    expect(pet.playing()).toBe("heart");

    expect(pet.play("moonwalk", 0)).toBe(false);
  });

  it("spreads the interval so it does not tick like a metronome", () => {
    const early = director(10, () => 0);
    const late = director(10, () => 1);

    early.paint(createFrame(), 0, state());
    late.paint(createFrame(), 0, state());

    early.paint(createFrame(), 6, state());
    late.paint(createFrame(), 6, state());

    expect(early.playing()).not.toBe("status");
    expect(late.playing()).toBe("status");
  });

  it("always paints something", () => {
    const pet = director(3);

    for (const t of [0, 1, 2, 3, 4, 5, 10, 25]) {
      const frame = createFrame();
      pet.paint(frame, t, state());

      expect(
        [...frame.toBytes()].some((byte) => byte > 0),
        `t=${t}`,
      ).toBe(true);
    }
  });
});
