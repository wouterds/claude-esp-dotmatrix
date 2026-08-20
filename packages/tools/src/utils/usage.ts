import { heading, muted, name } from "./colors";

/** What a tool does, how it is called, and what each argument means. */
export type Usage = {
  name: string;
  summary: string;
  // Paired with what each one gets you, so the shapes worth knowing are
  // readable without running any of them.
  examples: [string, string][];
  args: [string, string][];
};

const ASKED = ["--help", "-h"];

const section = (title: string, rows: [string, string][]) => {
  const width = Math.max(...rows.map(([left]) => left.length)) + 2;

  return [heading(title), ...rows.map(([left, right]) => `  ${left.padEnd(width)}${muted(right)}`)];
};

const render = (usage: Usage) => {
  const lines = [
    `${name(usage.name)}  ${muted(usage.summary)}`,
    "",
    ...section("usage", usage.examples),
  ];

  if (usage.args.length) lines.push("", ...section("arguments", usage.args));

  return lines.join("\n");
};

/**
 * Prints the usage and exits when help was asked for, so a tool calls this as
 * the first thing its parser does and otherwise carries straight on.
 */
export const help = (usage: Usage, argv: string[]) => {
  if (!argv.some((arg) => ASKED.includes(arg))) return;

  console.log(render(usage));
  process.exit(0);
};

export const run = (main: () => Promise<unknown>) => {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
};
