import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { home } from "./store";

// Written by the statusline rather than by a hook. `rate_limits` is the one
// thing Claude Code hands to a statusline and to nothing else - no hook payload
// carries it, and it is never written to a transcript or cached on disk.
const limitsFile = () => join(home(), "limits.json");

export type Quota = {
  /** How much of the window is spent, 0 to 1. */
  used: number;
  /** When the window starts again, in milliseconds. */
  resetsAt: number;
};

export type Limits = {
  fiveHour: Quota | null;
  sevenDay: Quota | null;
};

/** Nothing known. The rows stay dark rather than reading as nothing used. */
export const NO_LIMITS: Limits = { fiveHour: null, sevenDay: null };

/**
 * A reading is good until its own reset and no longer.
 *
 * Within one window a quota only ever climbs, so a file nothing has rewritten
 * for an hour still holds the number - which is what makes it safe to read a
 * statusline's leftovers between sessions. Past the reset it describes a window
 * that has already gone, and a stale figure there would read as room still spent
 * when the window is in fact empty.
 *
 * Checked rather than trusted, on the same bargain as the rest of the state: the
 * writer stays dumb and fast, and nothing it gets wrong can take the panel down.
 */
const quotaFrom = (raw: unknown, now: number): Quota | null => {
  if (typeof raw !== "object" || raw === null) return null;

  const { usedPercentage, resetsAt } = raw as Record<string, unknown>;

  if (typeof usedPercentage !== "number" || !Number.isFinite(usedPercentage)) return null;
  if (typeof resetsAt !== "number" || !Number.isFinite(resetsAt)) return null;
  if (now >= resetsAt) return null;

  return { used: Math.max(0, Math.min(1, usedPercentage / 100)), resetsAt };
};

export const readLimits = async (now: number, file = limitsFile()): Promise<Limits> => {
  const contents = await readFile(file, "utf8").catch(() => null);
  if (contents === null) return NO_LIMITS;

  try {
    const raw = JSON.parse(contents);

    return { fiveHour: quotaFrom(raw?.fiveHour, now), sevenDay: quotaFrom(raw?.sevenDay, now) };
  } catch {
    return NO_LIMITS;
  }
};
