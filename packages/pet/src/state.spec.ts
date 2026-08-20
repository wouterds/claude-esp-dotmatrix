import { describe, expect, it } from "vitest";
import { deriveMood, isMood, isStatus } from "./state";

describe("deriveMood", () => {
  it("lets a failure override how much room is left", () => {
    // given
    const fills = [0, 0.99];

    // when
    const moods = fills.map((fill) => deriveMood("error", fill));

    // then
    expect(moods).toEqual(["annoyed", "annoyed"]);
  });

  it("gives out at the very top of the window, whatever it was doing", () => {
    // given
    const spent = 0.96;

    // when
    const moods = (["thinking", "done"] as const).map((status) => deriveMood(status, spent));

    // then
    expect(moods).toEqual(["dead", "dead"]);
  });

  it("tires past three quarters", () => {
    // given
    const eitherSide = [0.74, 0.76];

    // when
    const moods = eitherSide.map((fill) => deriveMood("thinking", fill));

    // then
    expect(moods).toEqual(["focused", "tired"]);
  });

  it("rests when nothing is being asked of it", () => {
    // given
    const idleish = ["idle", "waiting"] as const;

    // when
    const moods = idleish.map((status) => deriveMood(status, 0.1));

    // then
    expect(moods).toEqual(["zen", "zen"]);
  });

  it("celebrates a finished task while there is still room", () => {
    // given
    const roomLeft = 0.2;

    // when
    const mood = deriveMood("done", roomLeft);

    // then
    expect(mood).toBe("happy");
  });
});

describe("guards", () => {
  it("accept only known names", () => {
    // given
    const names = ["thinking", "vibing", "annoyed", "hangry"];

    // when
    const [knownStatus, unknownStatus] = [isStatus(names[0]), isStatus(names[1])];
    const [knownMood, unknownMood] = [isMood(names[2]), isMood(names[3])];

    // then
    expect([knownStatus, unknownStatus]).toEqual([true, false]);
    expect([knownMood, unknownMood]).toEqual([true, false]);
  });
});
