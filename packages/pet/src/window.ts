import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// The subscription's rolling session window. The real figure - what `/usage`
// reports - is fetched from the API and cached nowhere on disk, so it cannot be
// read locally at all. What *is* exactly knowable is how far through the current
// window we are, which is the half that says when the limit lifts.
export const WINDOW_MS = 5 * 60 * 60 * 1000;

const TRANSCRIPTS = join(homedir(), ".claude", "projects");

// A window is anchored on the first message of an unbroken run of activity and
// then tiles forward. Only transcripts touched recently can carry the anchor, and
// only their tails can carry its timestamps.
const LOOKBACK_MS = 36 * 60 * 60 * 1000;
const TAIL_BYTES = 256 * 1024;

export type SessionWindow = {
  /** Milliseconds into the current window. */
  elapsed: number;
  /** 0 to 1 through it. */
  fraction: number;
  resetsAt: number;
};

/**
 * Where `now` sits in the current window, given every message timestamp known.
 *
 * A gap of a full window means the previous one lapsed and the next message
 * starts a fresh one. Without a gap the windows tile from the anchor, so a
 * twelve hour stretch is the third window rather than one long overrun.
 */
export const windowFrom = (timestamps: readonly number[], now: number): SessionWindow | null => {
  const past = [...timestamps].filter((at) => at <= now).sort((a, b) => a - b);
  if (past.length === 0) return null;

  let anchor = past[0];
  for (let i = 1; i < past.length; i++) {
    if (past[i] - past[i - 1] >= WINDOW_MS) anchor = past[i];
  }

  // The run itself may have lapsed - nothing said for hours means the window
  // that anchor started is long gone.
  if (now - past[past.length - 1] >= WINDOW_MS) return null;

  const elapsed = (now - anchor) % WINDOW_MS;

  return { elapsed, fraction: elapsed / WINDOW_MS, resetsAt: now + (WINDOW_MS - elapsed) };
};

const timestampsIn = async (path: string): Promise<number[]> => {
  const handle = await open(path, "r").catch(() => null);
  if (!handle) return [];

  try {
    const { size } = await handle.stat();
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.allocUnsafe(length);
    await handle.read(buffer, 0, length, size - length);

    const found: number[] = [];
    for (const line of buffer.toString("utf8").split("\n")) {
      if (!line.startsWith("{")) continue;

      try {
        const at = Date.parse(JSON.parse(line)?.timestamp ?? "");
        if (Number.isFinite(at)) found.push(at);
      } catch {
        // The tail starts mid-entry; a truncated first line is expected.
      }
    }

    return found;
  } finally {
    await handle.close();
  }
};

export const readWindow = async (now = Date.now()): Promise<SessionWindow | null> => {
  const projects = await readdir(TRANSCRIPTS).catch(() => null);
  if (!projects) return null;

  const timestamps: number[] = [];

  for (const project of projects) {
    const directory = join(TRANSCRIPTS, project);

    for (const entry of await readdir(directory).catch(() => [])) {
      if (!entry.endsWith(".jsonl")) continue;

      const path = join(directory, entry);
      const info = await stat(path).catch(() => null);
      if (!info || now - info.mtimeMs > LOOKBACK_MS) continue;

      timestamps.push(...(await timestampsIn(path)));
    }
  }

  return windowFrom(timestamps, now);
};
