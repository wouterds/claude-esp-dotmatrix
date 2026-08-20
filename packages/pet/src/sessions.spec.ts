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
  it("speaks for whichever session was heard from last", () => {
    const picked = pickSession([at(60, "thinking", "old"), at(2, "working", "new")], NOW);

    expect(picked?.id).toBe("new");
  });

  it("does not let a parked prompt outrank the session being worked in", () => {
    const picked = pickSession([at(1_200, "waiting", "parked"), at(3, "working", "active")], NOW);

    expect(picked?.id).toBe("active");
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

  it("hands the panel over once the session being worked in goes quiet", () => {
    const busy = at(1, "working", "busy", 600);
    const abandoned = at(400, "thinking", "abandoned", 20);

    expect(pickSession([busy, abandoned], NOW)?.id).toBe("busy");
  });

  it("falls back to activity for a session whose hooks were wired mid-flight", () => {
    const noPrompt = at(1, "working", "fresh");
    const older = at(30, "thinking", "older", 30);

    expect(pickSession([noPrompt, older], NOW)?.id).toBe("fresh");
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
