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

// What the session is doing. Every hook in .claude/hooks calls this and nothing
// else, so it has to be cheap and it has to never fail loudly.

const USAGE: Usage = {
  name: "status-set",
  summary: "tell the pet what the session is doing",
  examples: [
    ["status-set thinking", "the model is reasoning"],
    ["status-set error", "something failed - the pet stops being interrupted"],
    ["status-set idle --mood tired", "override the mood it would have picked"],
    ["status-set working --mood auto", "hand the mood back to the pet"],
  ],
  args: [
    [`<status>`, STATUSES.join(", ")],
    [`--mood <mood>`, `${MOODS.join(", ")}, or auto`],
  ],
};

type Options = { status: Status; mood: Mood | null | undefined };

const parse = (argv: string[]): Options => {
  help(USAGE, argv);

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
    } else if (arg?.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else if (arg) {
      if (!isStatus(arg))
        throw new Error(`Unknown status "${arg}". One of: ${STATUSES.join(", ")}`);

      status = arg;
    }
  }

  if (!status) throw new Error(`Usage: status-set <${STATUSES.join("|")}> [--mood <mood>]`);

  return { status, mood };
};

run(async () => {
  const options = parse(process.argv.slice(2));
  const patch = options.mood === undefined ? { status: options.status } : options;
  const desire = await writeDesire(patch);

  console.log(`${name(desire.status)} ${muted(desire.mood ?? "mood auto")}`);
});
