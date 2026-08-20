#!/usr/bin/env -S npx tsx

import { isRotation, ROTATIONS, type Rotation } from "@claude-status/matrix";
import { type Cell, writeDesire } from "@claude-status/pet";
import { figure, heading, muted } from "../utils/colors";
import { help, run, type Usage } from "../utils/usage";

// Which way up the panel ended on the desk is not knowable from here, and every
// face and glyph is wrong in three of the four cases. So rather than guess: draw
// something that cannot be read two ways, and let whoever can see it say.

const USAGE: Usage = {
  name: "status-orient",
  summary: "prove which way up the panel is, and turn it the right way",
  examples: [
    ["status-orient", "draw the marker and print how to read it"],
    ["status-orient --rotation 90", "turn a quarter clockwise and redraw"],
    ["status-orient --done", "clear the marker, hand the panel back"],
  ],
  args: [
    ["--rotation <deg>", ROTATIONS.join(", ")],
    ["--done", "clear the marker"],
  ],
};

// White corner, then two arms of two. Asymmetric in both axes and in colour, so
// no rotation or mirror of it looks like any other.
const MARKER: Cell[] = [
  [0, 0, "#ffffff"],
  [1, 0, "#ff0000"],
  [2, 0, "#ff0000"],
  [0, 1, "#00ff00"],
  [0, 2, "#00ff00"],
];

const parse = (argv: string[]) => {
  help(USAGE, argv);

  let rotation: Rotation | null = null;
  const done = argv.includes("--done");

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--rotation") {
      const value = Number(argv[++i]);

      if (!isRotation(value)) throw new Error(`--rotation takes one of: ${ROTATIONS.join(", ")}`);

      rotation = value;
    } else if (arg === "--done") {
      // Handled above.
    } else if (arg?.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  return { rotation, done };
};

run(async () => {
  const options = parse(process.argv.slice(2));

  if (options.done) {
    await writeDesire({ paint: null });
    console.log(muted("marker cleared"));

    return;
  }

  const patch =
    options.rotation === null ? { paint: MARKER } : { paint: MARKER, rotation: options.rotation };
  const desire = await writeDesire(patch);

  console.log(
    [
      heading(`marker up, rotation ${desire.rotation} degrees`),
      `  ${figure("white")}  ${muted("the origin - should be the top left corner")}`,
      `  ${figure("red")}    ${muted("runs right along the top edge")}`,
      `  ${figure("green")}  ${muted("runs down the left edge")}`,
      "",
      muted("Wrong? try each of --rotation 90, 180, 270 until it matches, then --done."),
    ].join("\n"),
  );
});
