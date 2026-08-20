import { describe, expect, it } from "vitest";
import { isLive, pickSession, type SessionSnapshot, waitingCount } from "./sessions";
import type { Status } from "./state";

const NOW = 1_800_000_000_000;

const at = (
  secondsAgo: number,
  status: Status = "working",
  id: string = status,
  spokenSecondsAgo: number | null = null,
): SessionSnapshot => ({
  id,
  status,
  at: NOW - secondsAgo * 1_000,
  spokenAt: spokenSecondsAgo === null ? null : NOW - spokenSecondsAgo * 1_000,
  transcript: `/transcripts/${id}.jsonl`,
  cwd: `/projects/${id}`,
});

describe("isLive", () => {
  it("holds an active status for a minute and a half", () => {
    // given
    const [inside, outside] = [at(80), at(100)];

    // when
    const live = [isLive(inside, NOW), isLive(outside, NOW)];

    // then
    expect(live).toEqual([true, false]);
  });

  it("holds waiting for half an hour, because nothing changes until the user acts", () => {
    // given
    const [inside, outside] = [at(1_500, "waiting"), at(2_000, "waiting")];

    // when
    const live = [isLive(inside, NOW), isLive(outside, NOW)];

    // then
    expect(live).toEqual([true, false]);
  });

  it("lets an error go after five minutes rather than holding the panel red", () => {
    // given
    const [inside, outside] = [at(200, "error"), at(400, "error")];

    // when
    const live = [isLive(inside, NOW), isLive(outside, NOW)];

    // then
    expect(live).toEqual([true, false]);
  });
});

describe("pickSession", () => {
  it("speaks for the session the user last sent a message to", () => {
    // given - `older` is far more recently active; `latest` was messaged more
    // recently.
    const older = at(2, "working", "older", 600);
    const latest = at(60, "thinking", "latest", 20);

    // when
    const shown = pickSession([older, latest], NOW);

    // then
    expect(shown?.id).toBe("latest");
  });

  it("shows a parked prompt when that is where the last message went", () => {
    // given
    const parked = at(1_200, "waiting", "parked", 1_200);
    const busy = at(3, "working", "busy", 4_000);

    // when
    const shown = pickSession([parked, busy], NOW);

    // then
    expect(shown?.id).toBe("parked");
  });

  it("ignores anything stale, so an abandoned session stops speaking", () => {
    // given
    const stale = [at(600, "thinking")];

    // when
    const shown = pickSession(stale, NOW);

    // then
    expect(shown).toBeNull();
  });

  it("returns null with nothing to go on, which is how the panel goes idle", () => {
    // given
    const nothing: SessionSnapshot[] = [];

    // when
    const shown = pickSession(nothing, NOW);

    // then
    expect(shown).toBeNull();
  });

  it("follows the session the user typed into last, not the busiest one", () => {
    // given - both grinding and firing hooks constantly; only the prompts differ.
    const busy = at(0, "working", "busy", 600);
    const mine = at(1, "thinking", "mine", 20);

    // when
    const shown = pickSession([busy, mine], NOW);

    // then
    expect(shown?.id).toBe("mine");
  });

  it("does not flicker while a busier session keeps firing hooks", () => {
    // given - the busy one is a hair more recent on each poll.
    const mine = at(2, "thinking", "mine", 20);
    const polls = [0, 0.1, 0.2, 0.3];

    // when / then - the sweep is the action, so it carries its own assertion
    for (const activity of polls) {
      const busy = at(activity, "working", "busy", 600);

      expect(pickSession([busy, mine], NOW)?.id, `activity ${activity}`).toBe("mine");
    }
  });

  it("never lets a session with no message take the panel off one with a message", () => {
    // given
    const spoken = at(30, "thinking", "spoken", 30);
    const neverSpoken = at(0, "working", "silent");

    // when
    const shown = pickSession([neverSpoken, spoken], NOW);

    // then
    expect(shown?.id).toBe("spoken");
  });

  it("goes idle rather than handing over when the messaged session goes quiet", () => {
    // given - `abandoned` had the last message and has gone stale. Switching to
    // `busy` would be a switch the user never asked for.
    const busy = at(1, "working", "busy", 600);
    const abandoned = at(400, "thinking", "abandoned", 20);

    // when
    const shown = pickSession([busy, abandoned], NOW);

    // then
    expect(shown).toBeNull();
  });

  it("falls back to activity only when nothing has been spoken to at all", () => {
    // given
    const neither = [at(1, "working", "a"), at(30, "thinking", "b")];

    // when
    const shown = pickSession(neither, NOW);

    // then
    expect(shown?.id).toBe("a");
  });
});

describe("waitingCount", () => {
  it("counts every live session blocked on the user", () => {
    // given
    const sessions = [at(1, "working", "a"), at(30, "waiting", "b"), at(60, "waiting", "c")];

    // when
    const waiting = waitingCount(sessions, NOW);

    // then
    expect(waiting).toBe(2);
  });

  it("counts the session being shown too - it is still a chat that wants you", () => {
    // given
    const here = [at(1, "waiting", "here")];

    // when
    const waiting = waitingCount(here, NOW);

    // then
    expect(waiting).toBe(1);
  });

  it("ignores the stale ones, so an abandoned prompt stops summoning", () => {
    // given
    const old = [at(5_000, "waiting", "old")];

    // when
    const waiting = waitingCount(old, NOW);

    // then
    expect(waiting).toBe(0);
  });

  it("is zero when nothing is waiting", () => {
    // given
    const busy = [at(1, "working", "a"), at(2, "thinking", "b")];

    // when
    const waiting = waitingCount(busy, NOW);

    // then
    expect(waiting).toBe(0);
  });
});
