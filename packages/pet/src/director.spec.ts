import { createFrame } from "@claude-status/matrix";
import { describe, expect, it } from "vitest";
import { createDirector } from "./director";
import type { PetState } from "./state";

const state = (status: PetState["status"] = "thinking"): PetState => ({
  status,
  mood: "focused",
  fill: 0.3,
  tokens: 60_000,
});

// 0 puts the next antic at half the mean, which is the soonest it schedules.
const director = (interval: number, random = () => 0) => createDirector({ interval, random });

describe("createDirector", () => {
  it("shows status until an antic is due", () => {
    const pet = director(10);

    pet.paint(createFrame(), 0, state());
    expect(pet.playing()).toBe("status");

    pet.paint(createFrame(), 4.9, state());
    expect(pet.playing()).toBe("status");

    pet.paint(createFrame(), 5.1, state());
    expect(pet.playing()).not.toBe("status");
  });

  it("returns to status when the antic runs out", () => {
    const pet = director(10);
    pet.paint(createFrame(), 0, state());
    pet.paint(createFrame(), 5.1, state());

    expect(pet.playing()).not.toBe("status");

    // After the longest antic ends but before the next one is due, which is
    // half the interval past the one that just played.
    pet.paint(createFrame(), 9, state());
    expect(pet.playing()).toBe("status");
  });

  it("never interrupts an error or a prompt waiting on the user", () => {
    for (const status of ["error", "waiting"] as const) {
      const pet = director(1);

      for (const t of [0, 1, 2, 5, 20, 100]) {
        pet.paint(createFrame(), t, state(status));
        expect(pet.playing(), `${status} at ${t}`).toBe("status");
      }
    }
  });

  it("drops whatever is playing the moment something needs acting on", () => {
    const pet = director(10);
    pet.paint(createFrame(), 0, state());
    pet.paint(createFrame(), 5.1, state());
    expect(pet.playing()).not.toBe("status");

    pet.paint(createFrame(), 5.2, state("error"));
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
