#!/usr/bin/env -S npx tsx

import { readFile } from "node:fs/promises";
import { findBoard, MAX_BRIGHTNESS } from "@claude-status/matrix";
import {
  deriveMood,
  findLatestTranscript,
  pidFile,
  readDesire,
  readUsage,
} from "@claude-status/pet";
import { bad, figure, good, heading, muted, name, pressure } from "../utils/colors";
import { help, run, type Usage } from "../utils/usage";

// Everything the panel is showing and why, in one screen. Written for the case
// where the display is dark and the question is which of four things is wrong.

const USAGE: Usage = {
  name: "status-show",
  summary: "what the pet is showing, and whether anything is driving it",
  examples: [["status-show", "status, mood, window, board and daemon"]],
  args: [],
};

const daemon = async () => {
  const pid = Number(await readFile(pidFile(), "utf8").catch(() => ""));
  if (!pid) return null;

  try {
    process.kill(pid, 0);

    return pid;
  } catch {
    // A pid file left behind by a crash. The next daemon reclaims it, so this is
    // "not running" rather than an error worth reporting as one.
    return null;
  }
};

const row = (label: string, value: string) => `${muted(label.padEnd(12))}${value}`;

run(async () => {
  help(USAGE, process.argv.slice(2));

  const [desire, pid, port, transcript] = await Promise.all([
    readDesire(),
    daemon(),
    findBoard(),
    findLatestTranscript(),
  ]);

  const usage = transcript ? await readUsage(transcript) : null;
  const fill = usage?.fill ?? 0;

  const lines = [
    heading("pet"),
    row("status", name(desire.status)),
    row(
      "mood",
      desire.mood
        ? `${name(desire.mood)} ${muted("set")}`
        : `${name(deriveMood(desire.status, fill))} ${muted("auto")}`,
    ),
    row(
      "showing",
      desire.paint
        ? `${figure(`${desire.paint.length} painted cells`)} ${muted("- pet is off duty")}`
        : muted("the pet"),
    ),
    "",
    heading("window"),
    row(
      "tokens",
      usage
        ? `${pressure(figure(usage.tokens.toLocaleString("en-US")), fill)} ${muted(`of ${(usage.limit).toLocaleString("en-US")}`)}`
        : muted("no transcript found"),
    ),
    row("full", usage ? pressure(`${Math.round(fill * 100)}%`, fill) : muted("-")),
    "",
    heading("hardware"),
    row("board", port ? good(port) : bad("not found on usb")),
    row("daemon", pid ? good(`running as pid ${pid}`) : bad("not running - npm start")),
    row("brightness", `${desire.brightness} ${muted(`of ${MAX_BRIGHTNESS}`)}`),
    row("rotation", `${desire.rotation}${muted("deg")}`),
  ];

  console.log(lines.join("\n"));
});
