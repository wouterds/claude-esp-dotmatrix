import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    passWithNoTests: true,
    env: { TZ: "UTC", NO_COLOR: "1" },
  },
});
