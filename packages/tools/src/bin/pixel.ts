#!/usr/bin/env -S npx tsx

import { HEIGHT, hex, WIDTH } from "@claude-status/matrix";
import { type Cell, readDesire, writeDesire } from "@claude-status/pet";
import { muted, name } from "../utils/colors";
import { help, run, type Usage } from "../utils/usage";

// Painting is a takeover, not an overlay: while any cell is set the pet is off
// duty and the panel is exactly what was asked for. The whole point of setting a
// pixel is seeing that pixel and nothing else.

const USAGE: Usage = {
  name: "status-pixel",
  summary: "drive individual pixels, and take the panel off the pet",
  examples: [
    ["status-pixel 0,0,#ff0000", "one red pixel, top left"],
    ["status-pixel 0,0,#f00 7,7,#0f0", "several at once, three digit hex is fine"],
    ["status-pixel 3,3,#fff --only", "start from a blank panel"],
    ["status-pixel --clear", "hand the panel back to the pet"],
  ],
  args: [
    ["<x,y,colour>", `x and y are 0 to ${WIDTH - 1}, colour is hex`],
    ["--only", "replace what is painted instead of adding to it"],
    ["--clear", "drop every painted cell"],
  ],
};

const widen = (colour: string) => {
  const digits = colour.replace("#", "");
  if (digits.length !== 3) return `#${digits}`;

  return `#${[...digits].map((digit) => digit + digit).join("")}`;
};

const parseCell = (argument: string): Cell => {
  const parts = argument.split(",");
  if (parts.length !== 3) throw new Error(`Expected x,y,colour - got "${argument}"`);

  const [x, y] = parts.map(Number);
  if (!Number.isInteger(x) || x < 0 || x >= WIDTH) throw new Error(`x must be 0 to ${WIDTH - 1}`);
  if (!Number.isInteger(y) || y < 0 || y >= HEIGHT) throw new Error(`y must be 0 to ${HEIGHT - 1}`);

  const colour = widen(parts[2]);
  // Parsed here rather than in the daemon, so a typo fails at the shell where
  // someone is looking instead of being skipped silently a frame later.
  hex(colour);

  return [x, y, colour];
};

const parse = (argv: string[]) => {
  help(USAGE, argv);

  const clear = argv.includes("--clear");
  const only = argv.includes("--only");
  const cells = argv.filter((arg) => !arg.startsWith("-")).map(parseCell);

  for (const arg of argv) {
    if (arg.startsWith("-") && !["--clear", "--only"].includes(arg)) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (!clear && cells.length === 0)
    throw new Error("Usage: status-pixel <x,y,colour>... | --clear");

  return { clear, only, cells };
};

// Last write wins per coordinate, so setting the same pixel twice is a change of
// mind rather than two entries the daemon renders in file order.
const merge = (existing: Cell[], added: Cell[]) => {
  const cells = new Map(existing.map((cell) => [`${cell[0]},${cell[1]}`, cell]));
  for (const cell of added) cells.set(`${cell[0]},${cell[1]}`, cell);

  return [...cells.values()];
};

run(async () => {
  const options = parse(process.argv.slice(2));

  if (options.clear) {
    await writeDesire({ paint: null });
    console.log(muted("panel handed back to the pet"));

    return;
  }

  const existing = options.only ? [] : ((await readDesire()).paint ?? []);
  const paint = merge(existing, options.cells);
  await writeDesire({ paint });

  console.log(`${name(String(paint.length))} ${muted("cells painted")}`);
});
