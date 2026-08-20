#!/usr/bin/env -S npx tsx

import { ANTIC_NAMES, anticNamed, writeDesire } from "@claude-status/pet";
import { muted, name } from "../utils/colors";
import { help, run, type Usage } from "../utils/usage";

// Interrupt the status scene with one antic, now. The timestamp is what the
// daemon triggers on, so asking for the same antic twice plays it twice.

const USAGE: Usage = {
  name: "status-play",
  summary: "make the pet do something, right now",
  examples: [
    ["status-play dance", "a bob and a hue cycle"],
    ["status-play heart", "for when it did something nice"],
    ["status-play --list", "every antic there is"],
  ],
  args: [
    ["<antic>", ANTIC_NAMES.join(", ")],
    ["--list", "print the names and exit"],
  ],
};

const parse = (argv: string[]) => {
  help(USAGE, argv);

  if (argv.includes("--list")) {
    console.log(ANTIC_NAMES.join("\n"));
    process.exit(0);
  }

  const wanted = argv.find((arg) => !arg.startsWith("-"));
  if (!wanted) throw new Error(`Usage: status-play <${ANTIC_NAMES.join("|")}>`);

  if (!anticNamed(wanted)) {
    throw new Error(`No antic called "${wanted}". One of: ${ANTIC_NAMES.join(", ")}`);
  }

  return wanted;
};

run(async () => {
  const antic = parse(process.argv.slice(2));
  await writeDesire({ antic: { name: antic, at: Date.now() } });

  console.log(`${name(antic)} ${muted("queued")}`);
});
