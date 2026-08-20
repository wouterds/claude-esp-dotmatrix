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
//
// Two things get wired: the hook, which says what a session is doing, and the
// status line, which is the only place Claude Code reports the 5h and weekly
// quotas. The status line slot holds one command, so an existing one is wrapped
// rather than replaced and handed back untouched on --remove.

const USAGE: Usage = {
  name: "status-install",
  summary: "wire the status hook and the quota statusline into every project, via your settings",
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
const scriptPath = async (file: string) => {
  let directory = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 8; depth++) {
    const candidate = join(directory, ".claude", "hooks", file);

    try {
      await readFile(candidate);

      return candidate;
    } catch {
      directory = resolve(directory, "..");
    }
  }

  throw new Error(`could not find .claude/hooks/${file} above this file`);
};

const holds = (entry: Entry, command: string) =>
  (entry.hooks ?? []).some((hook) => hook.command === command);

type StatusLine = { type?: string; command?: string };

// There is only one status line, and it is the only place Claude Code reports
// the quotas - so wiring the pet in means taking the slot and handing whatever
// was there the same payload. Quoted, because most such commands have spaces in
// them and it has to arrive as a single argument.
const quoted = (command: string) => `'${command.replace(/'/g, "'\\''")}'`;

const wrappedIn = (command: string, script: string) => {
  const argument = command.slice(script.length).trim();
  if (!argument.startsWith("'") || !argument.endsWith("'")) return null;

  return argument.slice(1, -1).replace(/'\\''/g, "'") || null;
};

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

  const command = await scriptPath("status.mjs");
  const statusline = await scriptPath("statusline.mjs");
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

  const current = (settings.statusLine ?? null) as StatusLine | null;
  const held = typeof current?.command === "string" ? current.command : "";
  const ours = held.startsWith(statusline);

  if (remove && ours) {
    const wrapped = wrappedIn(held, statusline);

    // Handed back exactly what it was wrapping, so taking the pet out leaves the
    // status line the user chose rather than no status line at all.
    if (wrapped) settings.statusLine = { ...current, command: wrapped };
    else delete settings.statusLine;

    changes.push(`${bad("-")} statusLine ${muted(wrapped ? `unwrapping ${wrapped}` : "")}`);
  } else if (!remove && !ours) {
    settings.statusLine = {
      ...current,
      type: "command",
      command: held ? `${statusline} ${quoted(held)}` : statusline,
    };

    changes.push(`${good("+")} statusLine ${muted(held ? `wrapping ${held}` : "")}`);
  }

  console.log(heading("hook"));
  console.log(`  ${name(command)}`);
  console.log("");
  console.log(heading("statusline"));
  console.log(`  ${name(statusline)}`);
  console.log(`  ${muted("the only thing claude code tells the 5h and weekly quotas to")}`);
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
