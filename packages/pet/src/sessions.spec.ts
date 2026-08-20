import { describe, expect, it } from "vitest";
import { attentionElsewhere, isLive, pickSession, type SessionSnapshot } from "./sessions";
import type { Status } from "./state";

const NOW = 1_800_000_000_000;

const at = (
  secondsAgo: number,
  status: Status = "working",
  id: string = status,
): SessionSnapshot => ({
  id,
  status,
  at: NOW - secondsAgo * 1_000,
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
