import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readUsage } from "./usage";

const transcript = async (lines: string[]) => {
  const directory = await mkdtemp(join(tmpdir(), "claude-status-"));
  const path = join(directory, "session.jsonl");
  await writeFile(path, `${lines.join("\n")}\n`);

  return path;
};

const entry = (usage: Record<string, number>) => JSON.stringify({ message: { usage } });

describe("readUsage", () => {
  it("counts everything in the window, cached reads included", async () => {
    const path = await transcript([
      entry({ input_tokens: 5, output_tokens: 10 }),
      entry({
        input_tokens: 2,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 90_000,
        output_tokens: 998,
      }),
    ]);

    expect(await readUsage(path, 200_000)).toEqual({ tokens: 92_000, fill: 0.46 });
  });

  it("takes the last entry, not the largest", async () => {
    const path = await transcript([
      entry({ input_tokens: 150_000 }),
      entry({ input_tokens: 1_000 }),
    ]);

    expect((await readUsage(path, 200_000))?.tokens).toBe(1_000);
  });

  it("skips entries carrying no usage, such as the user's own turns", async () => {
    const path = await transcript([
      entry({ input_tokens: 400 }),
      JSON.stringify({ type: "user", message: { content: "go on then" } }),
    ]);

    expect((await readUsage(path, 200_000))?.tokens).toBe(400);
  });

  it("caps fill at one rather than reporting a gauge past full", async () => {
    const path = await transcript([entry({ input_tokens: 900_000 })]);

    expect((await readUsage(path, 200_000))?.fill).toBe(1);
  });

  it("survives a corrupt line instead of taking the daemon down", async () => {
    const path = await transcript(["{not json at all", entry({ input_tokens: 7 })]);

    expect((await readUsage(path, 200_000))?.tokens).toBe(7);
  });

  it("returns null for a transcript that is not there", async () => {
    expect(await readUsage("/nope/missing.jsonl")).toBeNull();
  });
});
