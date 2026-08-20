import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_BRIGHTNESS, MAX_BRIGHTNESS } from "@claude-status/matrix";
import { describe, expect, it } from "vitest";
import { DEFAULT_DESIRE, readDesire, writeDesire } from "./store";

const scratch = async () => join(await mkdtemp(join(tmpdir(), "claude-status-")), "state.json");

describe("readDesire", () => {
  it("falls back to the default when there is no file yet", async () => {
    // given
    const missing = "/nope/state.json";

    // when
    const desire = await readDesire(missing);

    // then
    expect(desire).toEqual(DEFAULT_DESIRE);
  });

  it("falls back rather than throwing on a file that is not json", async () => {
    // given
    const file = await scratch();
    await writeFile(file, "{ status: broken,,");

    // when
    const desire = await readDesire(file);

    // then
    expect(desire).toEqual(DEFAULT_DESIRE);
  });

  it("drops a status it does not know, falling back to following the sessions", async () => {
    // given
    const file = await scratch();
    await writeFile(file, JSON.stringify({ status: "vibing" }));

    // when
    const desire = await readDesire(file);

    // then
    expect(desire.status).toBeNull();
  });

  it("clamps brightness to the ceiling, however the file was edited", async () => {
    // given
    const file = await scratch();
    await writeFile(file, JSON.stringify({ brightness: 9000 }));

    // when
    const desire = await readDesire(file);

    // then
    expect(desire.brightness).toBe(MAX_BRIGHTNESS);
  });

  it("ignores a rotation that is not a quarter turn", async () => {
    // given
    const file = await scratch();
    await writeFile(file, JSON.stringify({ rotation: 37 }));

    // when
    const desire = await readDesire(file);

    // then
    expect(desire.rotation).toBe(0);
  });

  it("keeps only the well formed cells", async () => {
    // given
    const file = await scratch();
    await writeFile(
      file,
      JSON.stringify({ paint: [[1, 2, "#ff0000"], ["nope"], [3, 4, "#00ff00"]] }),
    );

    // when
    const desire = await readDesire(file);

    // then
    expect(desire.paint).toEqual([
      [1, 2, "#ff0000"],
      [3, 4, "#00ff00"],
    ]);
  });

  it("treats a paint list with nothing usable left in it as no paint at all", async () => {
    // given
    const file = await scratch();
    await writeFile(file, JSON.stringify({ paint: [["nope"]] }));

    // when
    const desire = await readDesire(file);

    // then
    expect(desire.paint).toBeNull();
  });
});

describe("writeDesire", () => {
  it("merges into what is already there rather than replacing it", async () => {
    // given
    const file = await scratch();
    await writeDesire({ status: "working", brightness: 40 }, file);

    // when
    await writeDesire({ status: "error" }, file);

    // then
    const desire = await readDesire(file);
    expect(desire.status).toBe("error");
    expect(desire.brightness).toBe(40);
  });

  it("creates the directory on first write", async () => {
    // given
    const file = join(await mkdtemp(join(tmpdir(), "claude-status-")), "nested", "state.json");

    // when
    await writeDesire({ status: "done" }, file);

    // then
    expect((await readDesire(file)).status).toBe("done");
  });

  it("returns what it wrote, sanitised", async () => {
    // given
    const file = await scratch();

    // when
    const written = await writeDesire({ brightness: -10 }, file);

    // then
    expect(written).toMatchObject({ brightness: 0 });
  });

  it("leaves a valid file behind even when read back mid-sequence", async () => {
    // given
    const file = await scratch();
    const racing = ["idle", "thinking", "working", "done"] as const;

    // when
    await Promise.all(racing.map((status) => writeDesire({ status }, file)));

    // then - whichever won, the file parses and is one of them, never a partial
    // write.
    expect((await readDesire(file)).status).toMatch(/idle|thinking|working|done/);
  });

  it("defaults to following the sessions at the measured brightness", async () => {
    // given
    const defaults = DEFAULT_DESIRE;

    // when
    const { status, brightness } = defaults;

    // then
    expect(status).toBeNull();
    expect(brightness).toBe(DEFAULT_BRIGHTNESS);
  });
});
