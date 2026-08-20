import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_BRIGHTNESS, MAX_BRIGHTNESS } from "@claude-status/matrix";
import { describe, expect, it } from "vitest";
import { DEFAULT_DESIRE, readDesire, writeDesire } from "./store";

const scratch = async () => join(await mkdtemp(join(tmpdir(), "claude-status-")), "state.json");

describe("readDesire", () => {
  it("falls back to the default when there is no file yet", async () => {
    expect(await readDesire("/nope/state.json")).toEqual(DEFAULT_DESIRE);
  });

  it("falls back rather than throwing on a file that is not json", async () => {
    const file = await scratch();
    await writeFile(file, "{ status: broken,,");

    expect(await readDesire(file)).toEqual(DEFAULT_DESIRE);
  });

  it("drops a status it does not know instead of rendering nothing", async () => {
    const file = await scratch();
    await writeFile(file, JSON.stringify({ status: "vibing" }));

    expect((await readDesire(file)).status).toBe("idle");
  });

  it("clamps brightness to the ceiling, however the file was edited", async () => {
    const file = await scratch();
    await writeFile(file, JSON.stringify({ brightness: 9000 }));

    expect((await readDesire(file)).brightness).toBe(MAX_BRIGHTNESS);
  });

  it("ignores a rotation that is not a quarter turn", async () => {
    const file = await scratch();
    await writeFile(file, JSON.stringify({ rotation: 37 }));

    expect((await readDesire(file)).rotation).toBe(0);
  });

  it("keeps only well formed cells and treats an empty result as no paint", async () => {
    const file = await scratch();
    await writeFile(
      file,
      JSON.stringify({ paint: [[1, 2, "#ff0000"], ["nope"], [3, 4, "#00ff00"]] }),
    );

    expect((await readDesire(file)).paint).toEqual([
      [1, 2, "#ff0000"],
      [3, 4, "#00ff00"],
    ]);

    await writeFile(file, JSON.stringify({ paint: [["nope"]] }));
    expect((await readDesire(file)).paint).toBeNull();
  });
});

describe("writeDesire", () => {
  it("merges into what is already there rather than replacing it", async () => {
    const file = await scratch();
    await writeDesire({ status: "working", brightness: 40 }, file);
    await writeDesire({ status: "error" }, file);

    const desire = await readDesire(file);
    expect(desire.status).toBe("error");
    expect(desire.brightness).toBe(40);
  });

  it("creates the directory on first write", async () => {
    const file = join(await mkdtemp(join(tmpdir(), "claude-status-")), "nested", "state.json");
    await writeDesire({ status: "done" }, file);

    expect((await readDesire(file)).status).toBe("done");
  });

  it("returns what it wrote, sanitised", async () => {
    const file = await scratch();

    expect(await writeDesire({ brightness: -10 }, file)).toMatchObject({ brightness: 0 });
  });

  it("leaves a valid file behind even when read back mid-sequence", async () => {
    const file = await scratch();
    await Promise.all(
      (["idle", "thinking", "working", "done"] as const).map((status) =>
        writeDesire({ status }, file),
      ),
    );

    // Whichever won, the file parses and is one of them - never a partial write.
    expect(DEFAULT_DESIRE.brightness).toBe(DEFAULT_BRIGHTNESS);
    expect((await readDesire(file)).status).toMatch(/idle|thinking|working|done/);
  });
});
