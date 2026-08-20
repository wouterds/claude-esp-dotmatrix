#!/usr/bin/env -S npx tsx

import { DEFAULT_BRIGHTNESS, MAX_BRIGHTNESS } from "@claude-status/matrix";
import { readDesire, writeDesire } from "@claude-status/pet";
import { figure, muted } from "../utils/colors";
import { help, run, type Usage } from "../utils/usage";

const USAGE: Usage = {
  name: "status-brightness",
  summary: "how hard the panel is driven",
  examples: [
    ["status-brightness", "print what it is now"],
    ["status-brightness 12", "dim, for a dark room"],
    [`status-brightness ${MAX_BRIGHTNESS}`, "as bright as it goes"],
  ],
  args: [["<level>", `0 to ${MAX_BRIGHTNESS}, default ${DEFAULT_BRIGHTNESS}`]],
};

const parse = (argv: string[]) => {
  help(USAGE, argv);

  const wanted = argv.find((arg) => !arg.startsWith("-"));
  if (!wanted) return null;

  const level = Number(wanted);
  if (!Number.isFinite(level)) throw new Error(`Not a level: "${wanted}"`);

  return level;
};

run(async () => {
  const wanted = parse(process.argv.slice(2));
  const desire = wanted === null ? await readDesire() : await writeDesire({ brightness: wanted });

  // The firmware scales any frame over its 450mA budget, so a high level shows
  // as a dimmer picture rather than as a brownout - worth saying, because it
  // looks like the setting was ignored.
  console.log(`${figure(String(desire.brightness))} ${muted(`of ${MAX_BRIGHTNESS}`)}`);
});
