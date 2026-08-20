import { describe, expect, it } from "vitest";
import { deriveMood, isMood, isStatus } from "./state";

describe("deriveMood", () => {
  it("lets a failure override how much room is left", () => {
    expect(deriveMood("error", 0)).toBe("annoyed");
    expect(deriveMood("error", 0.99)).toBe("annoyed");
  });

  it("gives out at the very top of the window, whatever it was doing", () => {
    expect(deriveMood("thinking", 0.96)).toBe("dead");
    expect(deriveMood("done", 0.96)).toBe("dead");
  });

  it("tires past three quarters", () => {
    expect(deriveMood("thinking", 0.74)).toBe("focused");
    expect(deriveMood("thinking", 0.76)).toBe("tired");
  });

  it("rests when nothing is being asked of it", () => {
    expect(deriveMood("idle", 0.1)).toBe("zen");
    expect(deriveMood("waiting", 0.1)).toBe("zen");
  });

  it("celebrates a finished task while there is still room", () => {
    expect(deriveMood("done", 0.2)).toBe("happy");
  });
});

describe("guards", () => {
  it("accept only known names", () => {
    expect(isStatus("thinking")).toBe(true);
    expect(isStatus("vibing")).toBe(false);
    expect(isMood("annoyed")).toBe(true);
    expect(isMood("hangry")).toBe(false);
  });
});
