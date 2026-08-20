#!/usr/bin/env -S npx tsx

import {
  isMood,
  isStatus,
  MOODS,
  type Mood,
  STATUSES,
  type Status,
  writeDesire,
} from "@claude-status/pet";
import { muted, name } from "../utils/colors";
import { help, run, type Usage } from "../utils/usage";

// An override, and only that. The hooks report each session for themselves and
// the daemon follows whichever was heard from last, so setting a status here
// pins the panel until --auto releases it.

const USAGE: Usage = {
  name: "status-set",
  summary: "tell the pet what the session is doing",
  examples: [
    ["status-set thinking", "the model is reasoning"],
    ["status-set error", "something failed - the pet stops being interrupted"],
    ["status-set idle --mood tired", "override the mood it would have picked"],
    ["status-set --auto", "stop overriding - follow whichever session is live"],
  ],
  args: [
    [`<status>`, STATUSES.join(", ")],
    [`--mood <mood>`, `${MOODS.join(", ")}, or auto`],
    ["--auto", "stop overriding, follow the sessions again"],
  ],
};

type Options = { status: Status | null; mood: Mood | null | undefined };

const parse = (argv: string[]): Options => {
  help(USAGE, argv);

  const auto = argv.includes("--auto");
  let status: Status | null = null;
  let mood: Mood | null | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--mood") {
      const value = argv[++i];

      if (value === "auto") {
        mood = null;
      } else if (value && isMood(value)) {
        mood = value;
      } else {
        throw new Error(`--mood takes one of: ${MOODS.join(", ")}, auto`);
      }
    } else if (arg === "--auto") {
      // Handled above.
    } else if (arg?.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else if (arg) {
      if (!isStatus(arg))
        throw new Error(`Unknown status "${arg}". One of: ${STATUSES.join(", ")}`);

      status = arg;
    }
  }

  if (!status && !auto) {
    throw new Error(`Usage: status-set <${STATUSES.join("|")}> [--mood <mood>] | --auto`);
  }

  return { status: auto ? null : status, mood };
};

run(async () => {
  const options = parse(process.argv.slice(2));
  const patch = options.mood === undefined ? { status: options.status } : options;
  const desire = await writeDesire(patch);

  console.log(
    `${name(desire.status ?? "following the sessions")} ${muted(desire.mood ?? "mood auto")}`,
  );
});
