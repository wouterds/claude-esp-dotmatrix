#!/usr/bin/env -S npx tsx

import { findBoard, openMatrix } from "@claude-status/matrix";
import { bad, good, heading, muted, name } from "../utils/colors";
import { help, run, type Usage } from "../utils/usage";

// Is the board there, and does the firmware on it answer. Only reaches for the
// port when nothing else holds it, because the daemon keeps it open for as long
// as it runs and one open port is the whole design.

const USAGE: Usage = {
  name: "status-board",
  summary: "find the board and ask its firmware to answer",
  examples: [
    ["status-board", "find it, and ping it if the port is free"],
    ["status-board --ping", "insist on an answer, and fail if the port is held"],
  ],
  args: [["--ping", "treat a held or silent port as an error"]],
};

run(async () => {
  const argv = process.argv.slice(2);
  help(USAGE, argv);

  const insist = argv.includes("--ping");
  const port = await findBoard();

  console.log(heading("board"));

  if (!port) {
    console.log(`  ${bad("not found")} ${muted("- no espressif device on usb")}`);
    process.exit(insist ? 1 : 0);
  }

  console.log(`  ${good(port)}`);

  try {
    const matrix = await openMatrix();
    const answer = await matrix.ping(1_500);
    await matrix.close();

    console.log(`  ${name(answer)} ${muted("- firmware answered")}`);
  } catch (error) {
    const message = (error as Error).message;

    // A held port is the daemon doing its job, so it is only a failure when
    // someone asked to be sure the firmware is alive.
    console.log(`  ${insist ? bad(message) : muted(message)}`);
    console.log(`  ${muted("the daemon holds the port while it runs - stop it to ping")}`);

    if (insist) process.exit(1);
  }
});
