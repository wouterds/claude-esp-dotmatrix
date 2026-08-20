import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { limitFor, readUsage } from "./usage";

const transcript = async (lines: string[]) => {
  const directory = await mkdtemp(join(tmpdir(), "claude-status-"));
  const path = join(directory, "session.jsonl");
  await writeFile(path, `${lines.join("\n")}\n`);

  return path;
};

const entry = (usage: Record<string, number>) => JSON.stringify({ message: { usage } });

describe("readUsage", () => {
  it("counts everything in the window, cached reads included", async () => {
    // given
    const path = await transcript([
      entry({ input_tokens: 5, output_tokens: 10 }),
      entry({
        input_tokens: 2,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 90_000,
        output_tokens: 998,
      }),
    ]);

    // when
    const usage = await readUsage(path, 200_000);

    // then
    expect(usage).toEqual({ tokens: 92_000, fill: 0.46, limit: 200_000 });
  });

  it("takes the last entry, not the largest", async () => {
    // given
    const path = await transcript([
      entry({ input_tokens: 150_000 }),
      entry({ input_tokens: 1_000 }),
    ]);

    // when
    const usage = await readUsage(path, 200_000);

    // then
    expect(usage?.tokens).toBe(1_000);
  });

  it("skips entries carrying no usage, such as the user's own turns", async () => {
    // given
    const path = await transcript([
      entry({ input_tokens: 400 }),
      JSON.stringify({ type: "user", message: { content: "go on then" } }),
    ]);

    // when
    const usage = await readUsage(path, 200_000);

    // then
    expect(usage?.tokens).toBe(400);
  });

  it("caps fill at one rather than reporting a gauge past full", async () => {
    // given
    const path = await transcript([entry({ input_tokens: 900_000 })]);

    // when
    const usage = await readUsage(path, 200_000);

    // then
    expect(usage?.fill).toBe(1);
  });

  it("survives a corrupt line instead of taking the daemon down", async () => {
    // given
    const path = await transcript(["{not json at all", entry({ input_tokens: 7 })]);

    // when
    const usage = await readUsage(path, 200_000);

    // then
    expect(usage?.tokens).toBe(7);
  });

  it("returns null for a transcript that is not there", async () => {
    // given
    const missing = "/nope/missing.jsonl";

    // when
    const usage = await readUsage(missing);

    // then
    expect(usage).toBeNull();
  });

  it("widens the window rather than reporting a session as permanently full", async () => {
    // given
    const path = await transcript([entry({ input_tokens: 215_000 })]);

    // when
    const usage = await readUsage(path);

    // then
    expect(usage?.limit).toBe(1_000_000);
    expect(usage?.fill).toBeCloseTo(0.215, 3);
  });
});

describe("limitFor", () => {
  it("takes the narrowest window the reading still fits in", () => {
    // given
    const readings = [1, 200_000, 200_001];

    // when
    const limits = readings.map(limitFor);

    // then
    expect(limits).toEqual([200_000, 200_000, 1_000_000]);
  });

  it("stays on the widest rather than dividing by something smaller than the reading", () => {
    // given
    const beyondEverything = 5_000_000;

    // when
    const limit = limitFor(beyondEverything);

    // then
    expect(limit).toBe(1_000_000);
  });

  it("is overridable, for a window these do not know about", () => {
    // given
    process.env.CLAUDE_STATUS_CONTEXT = "500000";

    try {
      // when
      const limit = limitFor(10);

      // then
      expect(limit).toBe(500_000);
    } finally {
      delete process.env.CLAUDE_STATUS_CONTEXT;
    }
  });

  it("ignores an override that is not a positive number", () => {
    // given
    process.env.CLAUDE_STATUS_CONTEXT = "banana";

    try {
      // when
      const limit = limitFor(10);

      // then
      expect(limit).toBe(200_000);
    } finally {
      delete process.env.CLAUDE_STATUS_CONTEXT;
    }
  });
});
