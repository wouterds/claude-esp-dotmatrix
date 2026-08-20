#!/usr/bin/env node

// Plain node, no tsx and no workspace imports. This runs on every tool call, and
// tsx costs 290ms against node's 34ms - a quarter second added to each of a few
// hundred tool calls is a session made worse by its own decoration.
//
// So it writes one small file and validates nothing. @claude-status/pet owns the
// shape and the daemon sanitises what it reads, which is what makes keeping this
// dumb safe.
//
// A file per session, not one status for the machine: several sessions run at
// once and are switched between, and a single field means whichever fired a hook
// last wins - so a finished session would pin the panel on "done" while another
// is still working.

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const READING = new Set([
  "Read",
  "Glob",
  "Grep",
  "NotebookRead",
  "WebFetch",
  "WebSearch",
  "Task",
  "Agent",
]);
const WRITING = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
const RUNNING = new Set(["Bash", "BashOutput", "KillShell"]);

const statusFor = (event, tool) => {
  switch (event) {
    case "SessionStart":
      return "idle";
    case "UserPromptSubmit":
      return "thinking";
    case "PreToolUse":
      if (READING.has(tool)) return "reading";
      if (RUNNING.has(tool)) return "running";
      if (WRITING.has(tool)) return "working";

      // An MCP or plugin tool is still work being done, and "working" is the
      // honest reading of a name this does not recognise.
      return "working";
    // Back to reasoning: a result has landed and something has to decide on it.
    case "PostToolUse":
      return "thinking";
    // A permission prompt or an idle nudge. Either way it is the user's move,
    // and the pet stops interrupting itself while that is true.
    case "Notification":
      return "waiting";
    case "Stop":
    case "SubagentStop":
      return "done";
    default:
      return null;
  }
};

// Never fails, never prints, always exits 0. A hook that errors interrupts the
// session it is decorating, and no pet is worth that.
try {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  const event = payload.hook_event_name;
  const status = statusFor(event, payload.tool_name);

  const home = process.env.CLAUDE_STATUS_HOME ?? join(homedir(), ".claude-status");
  const directory = join(home, "sessions");
  const id = String(payload.session_id ?? "unknown").replace(/[^A-Za-z0-9_-]/g, "");
  const file = join(directory, `${id}.json`);

  if (event === "SessionEnd") {
    // Removed rather than set idle, so a closed session stops being a candidate
    // instead of competing with live ones as the quietest of them.
    try {
      unlinkSync(file);
    } catch {
      // Already gone, or never written.
    }
  } else if (status && id) {
    mkdirSync(directory, { recursive: true });

    // Carried forward, because which session the panel speaks for is ranked on
    // the last prompt and every other event has to leave that alone.
    let spokenAt = null;
    try {
      spokenAt = JSON.parse(readFileSync(file, "utf8")).spokenAt ?? null;
    } catch {
      // First event of a session, or one caught mid-write.
    }

    const now = Date.now();
    const snapshot = {
      status,
      at: now,
      spokenAt: event === "UserPromptSubmit" ? now : spokenAt,
      // The window is read from the session being shown rather than from
      // whichever transcript was touched last, so the gauge belongs to the face.
      transcript: payload.transcript_path ?? null,
      cwd: payload.cwd ?? null,
    };

    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(snapshot)}\n`);
    renameSync(temporary, file);
  }
} catch {
  // Nothing here is worth a word on someone's terminal.
}

process.exit(0);
