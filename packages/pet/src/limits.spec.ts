import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NO_LIMITS, readLimits } from "./limits";

const scratch = async () => join(await mkdtemp(join(tmpdir(), "claude-status-")), "limits.json");

const at = (file: string, contents: unknown) => writeFile(file, JSON.stringify(contents));

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60_000;

describe("readLimits", () => {
  it("reports nothing rather than nothing-used when the file is not there yet", async () => {
    // given
    const missing = "/nope/limits.json";

    // when
    const limits = await readLimits(NOW, missing);

    // then
    expect(limits).toEqual(NO_LIMITS);
  });

  it("falls back rather than throwing on a file that is not json", async () => {
    // given
    const file = await scratch();
    await writeFile(file, "{ fiveHour: broken,,");

    // when
    const limits = await readLimits(NOW, file);

    // then
    expect(limits).toEqual(NO_LIMITS);
  });

  it("reads a percentage as a fraction, so scenes only ever see 0 to 1", async () => {
    // given
    const file = await scratch();
    await at(file, {
      fiveHour: { usedPercentage: 23.5, resetsAt: NOW + HOUR },
      sevenDay: { usedPercentage: 41.2, resetsAt: NOW + 48 * HOUR },
    });

    // when
    const limits = await readLimits(NOW, file);

    // then
    expect(limits.fiveHour?.used).toBeCloseTo(0.235);
    expect(limits.sevenDay?.used).toBeCloseTo(0.412);
  });

  it("clamps a percentage that could not be true, however the file was edited", async () => {
    // given
    const file = await scratch();
    await at(file, {
      fiveHour: { usedPercentage: 900, resetsAt: NOW + HOUR },
      sevenDay: { usedPercentage: -5, resetsAt: NOW + HOUR },
    });

    // when
    const limits = await readLimits(NOW, file);

    // then
    expect(limits.fiveHour?.used).toBe(1);
    expect(limits.sevenDay?.used).toBe(0);
  });

  it("keeps a reading whose window has not rolled, however old the file is", async () => {
    // given - the whole reason a stale file is safe to trust: within one window a
    // quota only ever grows, so a reading nothing has invalidated is still the
    // number.
    const file = await scratch();
    await at(file, { fiveHour: { usedPercentage: 60, resetsAt: NOW + 1 }, sevenDay: null });

    // when
    const limits = await readLimits(NOW, file);

    // then
    expect(limits.fiveHour?.used).toBeCloseTo(0.6);
  });

  it("drops a reading once its window has rolled", async () => {
    // given - past the reset the window has started again and the last reading
    // describes a window that is gone. Better a dark row than a number that is
    // wrong in the direction of looking fine.
    const file = await scratch();
    await at(file, {
      fiveHour: { usedPercentage: 60, resetsAt: NOW - 1 },
      sevenDay: { usedPercentage: 41, resetsAt: NOW + 48 * HOUR },
    });

    // when
    const limits = await readLimits(NOW, file);

    // then
    expect(limits.fiveHour).toBeNull();
    expect(limits.sevenDay?.used).toBeCloseTo(0.41);
  });

  it("drops only the quota it cannot read, keeping the one it can", async () => {
    // given
    const file = await scratch();
    await at(file, {
      fiveHour: { usedPercentage: "loads", resetsAt: NOW + HOUR },
      sevenDay: { usedPercentage: 41, resetsAt: NOW + 48 * HOUR },
    });

    // when
    const limits = await readLimits(NOW, file);

    // then
    expect(limits.fiveHour).toBeNull();
    expect(limits.sevenDay?.used).toBeCloseTo(0.41);
  });

  it("carries the reset through, so a tool can say when the window lifts", async () => {
    // given
    const file = await scratch();
    await at(file, { fiveHour: { usedPercentage: 10, resetsAt: NOW + HOUR }, sevenDay: null });

    // when
    const limits = await readLimits(NOW, file);

    // then
    expect(limits.fiveHour?.resetsAt).toBe(NOW + HOUR);
  });
});
