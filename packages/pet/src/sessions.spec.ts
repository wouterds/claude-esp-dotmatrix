import { describe, expect, it } from "vitest";
import { attentionElsewhere, isLive, pickSession, type SessionSnapshot } from "./sessions";
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
    expect(isLive(at(80), NOW)).toBe(true);
    expect(isLive(at(100), NOW)).toBe(false);
  });

  it("holds waiting for half an hour, because nothing changes until the user acts", () => {
    expect(isLive(at(1_500, "waiting"), NOW)).toBe(true);
    expect(isLive(at(2_000, "waiting"), NOW)).toBe(false);
  });

  it("lets an error go after five minutes rather than holding the panel red", () => {
    expect(isLive(at(200, "error"), NOW)).toBe(true);
    expect(isLive(at(400, "error"), NOW)).toBe(false);
  });
});

describe("pickSession", () => {
  it("speaks for the session the user last sent a message to", () => {
    const older = at(2, "working", "older", 600);
    const latest = at(60, "thinking", "latest", 20);

    // `older` is far more recently active; `latest` was messaged more recently.
    expect(pickSession([older, latest], NOW)?.id).toBe("latest");
  });

  it("shows a parked prompt when that is where the last message went", () => {
    const parked = at(1_200, "waiting", "parked", 1_200);
    const busy = at(3, "working", "busy", 4_000);

    expect(pickSession([parked, busy], NOW)?.id).toBe("parked");
  });

  it("ignores anything stale, so an abandoned session stops speaking", () => {
    expect(pickSession([at(600, "thinking")], NOW)).toBeNull();
  });

  it("returns null with nothing to go on, which is how the panel goes idle", () => {
    expect(pickSession([], NOW)).toBeNull();
  });

  it("follows the session the user typed into last, not the busiest one", () => {
    // Both grinding and firing hooks constantly; only the prompts differ.
    const busy = at(0, "working", "busy", 600);
    const mine = at(1, "thinking", "mine", 20);

    expect(pickSession([busy, mine], NOW)?.id).toBe("mine");
  });

  it("does not flicker while a busier session keeps firing hooks", () => {
    const mine = at(2, "thinking", "mine", 20);

    // The busy one is a hair more recent on each poll; the pick must not move.
    for (const activity of [0, 0.1, 0.2, 0.3]) {
      const busy = at(activity, "working", "busy", 600);

      expect(pickSession([busy, mine], NOW)?.id, `activity ${activity}`).toBe("mine");
    }
  });

  it("never lets a session with no message take the panel off one with a message", () => {
    const spoken = at(30, "thinking", "spoken", 30);
    const neverSpoken = at(0, "working", "silent");

    expect(pickSession([neverSpoken, spoken], NOW)?.id).toBe("spoken");
  });

  it("goes idle rather than handing over when the messaged session goes quiet", () => {
    const busy = at(1, "working", "busy", 600);
    const abandoned = at(400, "thinking", "abandoned", 20);

    // `abandoned` had the last message, and it has gone stale. Switching to
    // `busy` would be a switch the user never asked for.
    expect(pickSession([busy, abandoned], NOW)).toBeNull();
  });

  it("falls back to activity only when nothing has been spoken to at all", () => {
    const neither = [at(1, "working", "a"), at(30, "thinking", "b")];

    expect(pickSession(neither, NOW)?.id).toBe("a");
  });
});

describe("attentionElsewhere", () => {
  it("flags another session blocked on the user", () => {
    const sessions = [at(1, "working", "active"), at(300, "waiting", "parked")];

    expect(attentionElsewhere(sessions, NOW, "active")).toBe(true);
  });

  it("does not flag the session already being shown", () => {
    const sessions = [at(1, "waiting", "here")];

    expect(attentionElsewhere(sessions, NOW, "here")).toBe(false);
  });

  it("does not flag a session that has stopped waiting, or a stale one", () => {
    expect(attentionElsewhere([at(1, "working", "other")], NOW, "here")).toBe(false);
    expect(attentionElsewhere([at(5_000, "waiting", "other")], NOW, "here")).toBe(false);
  });
});
