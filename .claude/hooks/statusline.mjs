#!/usr/bin/env node

// Plain node, no tsx and no workspace imports, for the same reason the hook next
// door is: this runs on every status line update and tsx costs 290ms against
// node's 34ms.
//
// A wrapper rather than a status line of its own. `rate_limits` is the one thing
// Claude Code hands to a status line and to nothing else - no hook payload
// carries it, it never reaches a transcript, and nothing caches it on disk - so
// holding the slot is the only way to see it. Whatever held the slot before is
// handed the identical payload and its output goes out untouched, which is what
// makes wiring the pet in cost one node start and change nothing on screen.
//
// It writes one small file and validates nothing. @claude-status/pet owns the
// shape and the daemon sanitises what it reads, the same bargain the hook is
// written under.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const wrapped = process.argv[2] ?? "";

let payload = "";
try {
  payload = readFileSync(0, "utf8");
} catch {
  // Nothing on stdin. The wrapped command still gets its turn below.
}

try {
  const limits = JSON.parse(payload)?.rate_limits;

  // Absent on an api key rather than a subscription, and before the first
  // response of a session. Leaving the file alone is what keeps the last good
  // reading on the panel instead of blanking it between sessions.
  if (limits) {
    // Seconds on the wire, milliseconds on disk: every other timestamp under
    // ~/.claude-status is a Date.now(), and one unit across all of them is
    // worth the multiply.
    const quota = (reading) => {
      if (!reading) return null;

      const { used_percentage: used, resets_at: resets } = reading;
      if (typeof used !== "number" || typeof resets !== "number") return null;

      return { usedPercentage: used, resetsAt: resets * 1000 };
    };

    const home = process.env.CLAUDE_STATUS_HOME ?? join(homedir(), ".claude-status");
    const file = join(home, "limits.json");
    const snapshot = { fiveHour: quota(limits.five_hour), sevenDay: quota(limits.seven_day) };

    mkdirSync(home, { recursive: true });

    // Written beside the target and renamed over it, because the daemon reads
    // this every couple of seconds and would otherwise catch a half written
    // file. A rename within one directory is atomic; a write in place is not.
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(snapshot)}\n`);
    renameSync(temporary, file);
  }
} catch {
  // A payload that will not parse, a home that will not take a file - none of it
  // is worth a word on someone's status line, and a pet is never worth breaking
  // the line the user actually chose.
}

if (wrapped) {
  // stdout inherited rather than captured, so the wrapped command writes its
  // line straight out and nothing here has to understand what it printed.
  const result = spawnSync("/bin/sh", ["-c", wrapped], {
    input: payload,
    stdio: ["pipe", "inherit", "inherit"],
  });

  process.exit(result.status ?? 0);
}
