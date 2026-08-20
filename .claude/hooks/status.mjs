#!/usr/bin/env node

// Plain node, no tsx and no workspace imports. This runs on every tool call, and
// tsx costs 290ms against node's 34ms - a quarter second added to each of a few
// hundred tool calls is a session made worse by its own decoration.
//
// So it writes the one field it owns straight into the state file and skips
// validating anything. @claude-status/pet is the shape's owner and the daemon
// sanitises what it reads, which is what makes this safe to keep dumb.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
    case "SessionEnd":
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
  const status = statusFor(payload.hook_event_name, payload.tool_name);

  if (status) {
    const home = process.env.CLAUDE_STATUS_HOME ?? join(homedir(), ".claude-status");
    const file = join(home, "state.json");

    mkdirSync(home, { recursive: true });

    let state = {};
    try {
      state = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      // No file yet, or one being rewritten. Either way, start from nothing.
    }

    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ ...state, status }, null, 2)}\n`);
    renameSync(temporary, file);
  }
} catch {
  // Nothing here is worth a word on someone's terminal.
}

process.exit(0);
