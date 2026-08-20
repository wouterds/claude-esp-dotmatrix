#!/usr/bin/env -S npx tsx

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { findBoard, MAX_BRIGHTNESS } from "@claude-status/matrix";
import {
  findLatestTranscript,
  isLive,
  pickSession,
  pidFile,
  type Quota,
  readDesire,
  readLimits,
  readSessions,
  readUsage,
  resolveState,
} from "@claude-status/pet";
import { bad, figure, good, heading, muted, name, pressure } from "../utils/colors";
import { help, run, type Usage } from "../utils/usage";

// Everything the panel is showing and why, in one screen. Written for the case
// where the display is dark and the question is which of four things is wrong.

const USAGE: Usage = {
  name: "status-show",
  summary: "what the pet is showing, which session it speaks for, and what is driving it",
  examples: [["status-show", "the panel, every live session, the board and the daemon"]],
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

// The two edge rows, in words. Unknown rather than zero when nothing has written
// them, on the same rule the rows go dark under - "none of the week used" is the
// one wrong answer here that looks like good news.
const quota = (label: string, reading: Quota | null, when: (at: Date) => string) =>
  row(
    label,
    reading
      ? `${pressure(`${Math.round(reading.used * 100)}%`, reading.used)} ${muted(
          `used, resets ${when(new Date(reading.resetsAt))}`,
        )}`
      : muted("unknown - no statusline has written one, see status-install"),
  );

const ago = (at: number, now: number) => {
  const seconds = Math.round((now - at) / 1_000);
  if (seconds < 60) return `${seconds}s ago`;

  return `${Math.round(seconds / 60)}m ago`;
};

run(async () => {
  help(USAGE, process.argv.slice(2));

  const now = Date.now();
  const [desire, snapshots, pid, port] = await Promise.all([
    readDesire(),
    readSessions(),
    daemon(),
    findBoard(),
  ]);

  const shown = pickSession(snapshots, now);
  const limits = await readLimits(now);
  const transcript = shown?.transcript ?? (await findLatestTranscript());
  const usage = transcript ? await readUsage(transcript) : null;
  const reading = { tokens: usage?.tokens ?? 0, fill: usage?.fill ?? 0 };
  const { state } = resolveState(desire, snapshots, reading, limits, now);

  const lines = [
    heading("panel"),
    row("status", `${name(state.status)} ${muted(desire.status ? "override" : "from session")}`),
    row("mood", `${name(state.mood)} ${muted(desire.mood ? "set" : "auto")}`),
    row(
      "waiting",
      state.waiting > 0
        ? `${figure(String(state.waiting))} ${muted(
            `chat${state.waiting === 1 ? "" : "s"} blocked on you - the corner dot is ${
              state.waiting >= 3 ? "red" : state.waiting === 2 ? "orange" : "yellow"
            }`,
          )}`
        : muted("nothing"),
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
        ? `${pressure(figure(usage.tokens.toLocaleString("en-US")), reading.fill)} ${muted(`of ${usage.limit.toLocaleString("en-US")}`)}`
        : muted("no transcript found"),
    ),
    row("full", usage ? pressure(`${Math.round(reading.fill * 100)}%`, reading.fill) : muted("-")),
    "",
    // What the two edge rows are showing. Account-wide, so unlike the context
    // window above these are the same figures whichever session is speaking.
    heading("quotas"),
    quota("5h", limits.fiveHour, (at) => at.toLocaleTimeString()),
    quota("week", limits.sevenDay, (at) => at.toLocaleString()),
    "",
    heading("sessions"),
  ];

  if (snapshots.length === 0) {
    lines.push(row("none", muted("no hooks have fired - see status-install")));
  }

  // Newest first, and the one being spoken for is marked. With four sessions
  // open the useful question is which of them the panel means.
  for (const snapshot of [...snapshots].sort((a, b) => b.at - a.at)) {
    const live = isLive(snapshot, now);
    const marker = snapshot.id === shown?.id ? figure("->") : "  ";
    const where = snapshot.cwd ? basename(snapshot.cwd) : snapshot.id.slice(0, 8);
    const label = live ? name(snapshot.status) : muted(snapshot.status);

    lines.push(`${marker} ${where.padEnd(24)}${label.padEnd(20)}${muted(ago(snapshot.at, now))}`);
  }

  lines.push(
    "",
    heading("hardware"),
    row("board", port ? good(port) : bad("not found on usb")),
    row("daemon", pid ? good(`running as pid ${pid}`) : bad("not running - npm start")),
    row("brightness", `${desire.brightness} ${muted(`of ${MAX_BRIGHTNESS}`)}`),
    row("rotation", `${desire.rotation}${muted("deg")}`),
  );

  console.log(lines.join("\n"));
});
