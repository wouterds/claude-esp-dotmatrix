#!/usr/bin/env -S npx tsx

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bad, figure, good, heading, muted, name } from "../utils/colors";
import { help, run, type Usage } from "../utils/usage";

// The hooks committed in this repo only fire in this repo. A pet that works in
// one project is a demo, so the same hook goes into the user's own settings with
// an absolute path and follows them everywhere.

const USAGE: Usage = {
  name: "status-install",
  summary: "wire the status hook into every project, via your own claude settings",
  examples: [
    ["status-install", "show exactly what would change, and change nothing"],
    ["status-install --write", "apply it, after backing the file up"],
    ["status-install --remove --write", "take it back out again"],
  ],
  args: [
    ["--write", "actually write - without it this is a dry run"],
    ["--remove", "remove the hook instead of adding it"],
  ],
};

const EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
  "SessionEnd",
] as const;

const MATCHED = new Set(["PreToolUse", "PostToolUse"]);

type Entry = { matcher?: string; hooks?: { type?: string; command?: string }[] };

// Walked up from this file rather than assumed, so the tool still resolves when
// the repo is checked out somewhere else or run through a symlink.
const hookPath = async () => {
  let directory = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 8; depth++) {
    const candidate = join(directory, ".claude", "hooks", "status.mjs");

    try {
      await readFile(candidate);

      return candidate;
    } catch {
      directory = resolve(directory, "..");
    }
  }

  throw new Error("could not find .claude/hooks/status.mjs above this file");
};

const holds = (entry: Entry, command: string) =>
  (entry.hooks ?? []).some((hook) => hook.command === command);

run(async () => {
  const argv = process.argv.slice(2);
  help(USAGE, argv);

  const write = argv.includes("--write");
  const remove = argv.includes("--remove");

  for (const arg of argv) {
    if (arg.startsWith("-") && !["--write", "--remove"].includes(arg)) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  const command = await hookPath();
  const settingsFile = join(homedir(), ".claude", "settings.json");
  const existing = await readFile(settingsFile, "utf8").catch(() => null);

  let settings: Record<string, unknown> = {};
  if (existing !== null) {
    try {
      settings = JSON.parse(existing);
    } catch {
      // Refused rather than overwritten. This is the user's own configuration
      // and a parse failure here means something we did not write is in it.
      throw new Error(`${settingsFile} is not valid json - fix it before installing`);
    }
  }

  const hooks = (settings.hooks ?? {}) as Record<string, Entry[]>;
  const changes: string[] = [];

  for (const event of EVENTS) {
    const entries = Array.isArray(hooks[event]) ? [...hooks[event]] : [];
    const mine = entries.filter((entry) => holds(entry, command));

    if (remove) {
      if (mine.length === 0) continue;

      hooks[event] = entries.filter((entry) => !holds(entry, command));
      if (hooks[event].length === 0) delete hooks[event];
      changes.push(`${bad("-")} ${event}`);

      continue;
    }

    // Idempotent: everything else already in the event is left alone, so this
    // sits alongside whatever hooks the user already runs.
    if (mine.length > 0) continue;

    const entry: Entry = { hooks: [{ type: "command", command }] };
    if (MATCHED.has(event)) entry.matcher = "*";

    entries.push(entry);
    hooks[event] = entries;
    changes.push(`${good("+")} ${event}`);
  }

  settings.hooks = hooks;

  console.log(heading("hook"));
  console.log(`  ${name(command)}`);
  console.log("");
  console.log(heading(`settings  ${settingsFile}`));

  if (changes.length === 0) {
    console.log(`  ${muted(remove ? "not installed - nothing to remove" : "already installed")}`);

    return;
  }

  for (const change of changes) console.log(`  ${change}`);
  console.log("");

  if (!write) {
    console.log(muted("dry run - pass --write to apply"));

    return;
  }

  await mkdir(dirname(settingsFile), { recursive: true });

  // Backed up before the first write, because this file is the user's own and
  // may carry hooks, permissions and env that nothing here knows about.
  if (existing !== null) {
    const backup = `${settingsFile}.bak`;
    await copyFile(settingsFile, backup);
    console.log(`${muted("backed up to")} ${backup}`);
  }

  await writeFile(settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(
    `${figure("installed")} ${muted("- new sessions in any project will drive the pet")}`,
  );
});
