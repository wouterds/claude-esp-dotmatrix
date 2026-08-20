import { describe, expect, it } from "vitest";
import { WINDOW_MS, windowFrom } from "./window";

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

const hoursAgo = (...hours: number[]) => hours.map((h) => NOW - h * HOUR);

describe("windowFrom", () => {
  it("measures from the first message of an unbroken run", () => {
    const window = windowFrom(hoursAgo(3, 2, 1, 0.5), NOW);

    expect(window?.elapsed).toBe(3 * HOUR);
    expect(window?.fraction).toBeCloseTo(0.6, 5);
  });

  it("says when the window lifts", () => {
    const window = windowFrom(hoursAgo(3), NOW);

    expect(window?.resetsAt).toBe(NOW + 2 * HOUR);
  });

  it("starts a fresh window after a gap of a whole one", () => {
    // Busy nine hours ago, quiet for six, back an hour ago. The old window
    // lapsed, so the run that matters began an hour ago.
    const window = windowFrom(hoursAgo(9, 8, 1, 0.2), NOW);

    expect(window?.elapsed).toBe(HOUR);
  });

  it("tiles forward instead of overrunning, on a long unbroken stretch", () => {
    // Twelve hours of activity with no gap is the third window, two hours in -
    // not one window twelve hours over.
    const timestamps = Array.from({ length: 25 }, (_, i) => NOW - i * 30 * 60 * 1000);
    const window = windowFrom(timestamps, NOW);

    expect(window?.elapsed).toBe(2 * HOUR);
    expect(window?.elapsed).toBeLessThan(WINDOW_MS);
  });

  it("reports nothing once the last message is a whole window old", () => {
    expect(windowFrom(hoursAgo(6, 7), NOW)).toBeNull();
  });

  it("reports nothing with no timestamps at all", () => {
    expect(windowFrom([], NOW)).toBeNull();
  });

  it("ignores timestamps in the future rather than reporting a negative window", () => {
    const window = windowFrom([...hoursAgo(2), NOW + 5 * HOUR], NOW);

    expect(window?.elapsed).toBe(2 * HOUR);
  });

  it("never reports past the end of a window", () => {
    for (const hours of [0, 1, 4.9, 5.1, 9.9, 30]) {
      const window = windowFrom(
        Array.from({ length: 200 }, (_, i) => NOW - i * 6 * 60 * 1000).concat(hoursAgo(hours)),
        NOW,
      );

      if (window) expect(window.fraction, `${hours}h`).toBeLessThanOrEqual(1);
    }
  });
});
