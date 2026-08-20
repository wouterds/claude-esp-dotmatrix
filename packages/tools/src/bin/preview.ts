#!/usr/bin/env -S npx tsx

import { createFrame, HEIGHT } from "@claude-status/matrix";
import {
  ANTIC_NAMES,
  anticNamed,
  createDirector,
  type Desire,
  findLatestTranscript,
  type Limits,
  NO_LIMITS,
  pickSession,
  readDesire,
  readLimits,
  readSessions,
  readUsage,
  resolveState,
  type SessionSnapshot,
} from "@claude-status/pet";
import { muted, name } from "../utils/colors";
import { renderFrame, rewind } from "../utils/terminal";
import { help, run, type Usage } from "../utils/usage";

// The panel, in the terminal. Written because these scenes were built by someone
// who could not see the LEDs, and kept because it is still the fastest way to
// judge whether a face reads at eight by eight.
//
// It resolves through the same resolveState the daemon uses. A preview that
// drifts from the panel is worse than no preview.

const FPS = 20;

const USAGE: Usage = {
  name: "status-preview",
  summary: "watch the panel in the terminal, without a board",
  examples: [
    ["status-preview", "mirror what the pet is showing right now"],
    ["status-preview dance", "loop one antic"],
    ["status-preview --seconds 5", "stop on its own instead of on ctrl-c"],
  ],
  args: [
    ["[antic]", ANTIC_NAMES.join(", ")],
    ["--seconds N", "stop after N seconds"],
  ],
};

const parse = (argv: string[]) => {
  help(USAGE, argv);

  let seconds: number | null = null;
  let antic: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--seconds") {
      seconds = Number(argv[++i]);

      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("--seconds takes a number");
    } else if (arg?.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else if (arg) {
      if (!anticNamed(arg)) throw new Error(`No antic called "${arg}"`);

      antic = arg;
    }
  }

  return { seconds, antic };
};

run(async () => {
  const options = parse(process.argv.slice(2));
  const director = createDirector();
  const started = Date.now();

  let desire: Desire = await readDesire();
  let snapshots: SessionSnapshot[] = [];
  let reading = { tokens: 0, fill: 0 };
  let limits: Limits = NO_LIMITS;

  const refresh = async () => {
    desire = await readDesire();
    snapshots = await readSessions();
    limits = await readLimits(Date.now());

    // The session being shown, so the gauge belongs to the face above it.
    const shown = pickSession(snapshots, Date.now());
    const transcript = shown?.transcript ?? (await findLatestTranscript());
    const usage = transcript ? await readUsage(transcript) : null;

    if (usage) reading = { tokens: usage.tokens, fill: usage.fill };
  };

  await refresh();
  const poller = setInterval(refresh, 1_000);

  console.log(`${name(options.antic ?? "live")} ${muted("- ctrl-c to stop")}`);
  console.log("\n".repeat(HEIGHT - 1));

  const timer = setInterval(
    () => {
      const elapsed = (Date.now() - started) / 1_000;

      if (options.seconds !== null && elapsed >= options.seconds) {
        clearInterval(timer);
        clearInterval(poller);
        process.exit(0);
      }

      const frame = createFrame();
      const { state } = resolveState(desire, snapshots, reading, limits, Date.now());

      if (options.antic) {
        const scene = anticNamed(options.antic)!;
        scene.paint(frame, elapsed % (scene.duration ?? 1), state);
      } else {
        director.paint(frame, elapsed, state);
      }

      process.stdout.write(`${rewind(HEIGHT)}${renderFrame(frame)}\n`);
    },
    Math.round(1_000 / FPS),
  );
});
