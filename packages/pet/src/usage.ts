import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Claude Code's own default. A session on a wider window reports a fill that
// reads low rather than wrong, which is the safer way round for a gauge.
export const CONTEXT_LIMIT = 200_000;

// A transcript grows to megabytes over a long session and the answer is always
// in the last few entries, so only the tail is read. Enough for a handful of
// turns, including ones carrying a large tool result.
const TAIL_BYTES = 512 * 1024;

const TRANSCRIPTS = join(homedir(), ".claude", "projects");

export type Usage = {
  tokens: number;
  fill: number;
};

type UsageFields = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

// Everything the model was handed plus what it produced. The cached portions
// count: they are in the window whether or not they were paid for again, and
// the window is what the gauge is about.
const contextOf = (usage: UsageFields) =>
  (usage.input_tokens ?? 0) +
  (usage.cache_creation_input_tokens ?? 0) +
  (usage.cache_read_input_tokens ?? 0) +
  (usage.output_tokens ?? 0);

export const readUsage = async (
  transcriptPath: string,
  limit = CONTEXT_LIMIT,
): Promise<Usage | null> => {
  const handle = await open(transcriptPath, "r").catch(() => null);
  if (!handle) return null;

  try {
    const { size } = await handle.stat();
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.allocUnsafe(length);
    await handle.read(buffer, 0, length, size - length);

    const lines = buffer.toString("utf8").split("\n");

    // Backwards, because the newest entry carrying usage is the current fill and
    // every earlier one is a smaller window that has since grown.
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith("{")) continue;

      try {
        const usage = JSON.parse(line)?.message?.usage as UsageFields | undefined;
        if (!usage) continue;

        const tokens = contextOf(usage);

        return { tokens, fill: Math.min(1, tokens / limit) };
      } catch {
        // A truncated first line is expected - the tail starts mid-entry.
      }
    }

    return null;
  } finally {
    await handle.close();
  }
};

export const findLatestTranscript = async (): Promise<string | null> => {
  const projects = await readdir(TRANSCRIPTS).catch(() => null);
  if (!projects) return null;

  let newest: { path: string; at: number } | null = null;

  for (const project of projects) {
    const directory = join(TRANSCRIPTS, project);
    const entries = await readdir(directory).catch(() => []);

    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;

      const path = join(directory, entry);
      const info = await stat(path).catch(() => null);
      if (!info) continue;

      if (!newest || info.mtimeMs > newest.at) newest = { path, at: info.mtimeMs };
    }
  }

  return newest?.path ?? null;
};
