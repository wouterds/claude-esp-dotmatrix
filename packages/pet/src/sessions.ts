import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { isStatus, type Status } from "./state";
import { home } from "./store";

// One file per session rather than one status for the machine. Several sessions
// run at once and are switched between, so a single field means whichever fired
// a hook last wins - a finished session pins the panel on "done" while another
// is still working, and nothing ever decays back.
const sessionsDir = () => join(home(), "sessions");

export type SessionSnapshot = {
  id: string;
  status: Status;
  /** Last time anything happened here. Decides whether the session is live. */
  at: number;
  /** Last time the user typed into it. Decides which live session speaks. */
  spokenAt: number | null;
  transcript: string | null;
  cwd: string | null;
};

// How long a snapshot still describes the session it came from. An active status
// is a claim about right now and goes stale in a minute and a half; waiting is a
// claim that nothing more will happen until the user acts, which stays true for
// as long as they do not.
const ACTIVE_WINDOW = 90_000;
const WINDOWS: Partial<Record<Status, number>> = {
  waiting: 30 * 60_000,
  // Long enough to be seen after stepping away, short enough that a session
  // abandoned in a bad state does not hold the panel red all afternoon.
  error: 5 * 60_000,
};

const windowFor = (status: Status) => WINDOWS[status] ?? ACTIVE_WINDOW;

export const isLive = (snapshot: SessionSnapshot, now: number) =>
  now - snapshot.at <= windowFor(snapshot.status);

export const readSessions = async (): Promise<SessionSnapshot[]> => {
  const directory = sessionsDir();
  const entries = await readdir(directory).catch(() => []);
  const snapshots: SessionSnapshot[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;

    const contents = await readFile(join(directory, entry), "utf8").catch(() => null);
    if (contents === null) continue;

    try {
      const raw = JSON.parse(contents);
      if (typeof raw?.status !== "string" || !isStatus(raw.status)) continue;
      if (typeof raw?.at !== "number") continue;

      snapshots.push({
        id: entry.replace(/\.json$/, ""),
        status: raw.status,
        at: raw.at,
        spokenAt: typeof raw.spokenAt === "number" ? raw.spokenAt : null,
        transcript: typeof raw.transcript === "string" ? raw.transcript : null,
        cwd: typeof raw.cwd === "string" ? raw.cwd : null,
      });
    } catch {
      // A snapshot caught mid-write. The next poll is 120ms away.
    }
  }

  return snapshots;
};

// Which session the user is actually in, falling back to plain activity for one
// whose hooks were wired mid-session and has no prompt recorded yet.
const engagedAt = (snapshot: SessionSnapshot) => snapshot.spokenAt ?? snapshot.at;

/**
 * The session the panel speaks for: **the one the user last sent a message to**,
 * and nothing else moves it.
 *
 * Only a prompt switches sessions. Ranking on activity instead means the panel
 * follows whatever is busiest, which is both wrong - the session being watched
 * is the one just typed into, not the one making the most noise - and unstable:
 * two grinding sessions each fire hooks several times a second, so the panel
 * flickers between them and settles on neither.
 *
 * It still stops speaking once it goes quiet. What it does *not* do is hand over
 * to a different session at that point, because that would be a switch nobody
 * asked for - the panel goes idle instead.
 */
export const pickSession = (
  snapshots: readonly SessionSnapshot[],
  now: number,
): SessionSnapshot | null => {
  // A session whose hooks were wired mid-flight has no prompt recorded. Those
  // compete only when nothing has been spoken to at all, so one of them cannot
  // take the panel off a session the user actually typed into.
  const spoken = snapshots.filter((snapshot) => snapshot.spokenAt !== null);
  const pool = spoken.length > 0 ? spoken : snapshots;
  if (pool.length === 0) return null;

  const chosen = pool.reduce((best, snapshot) =>
    engagedAt(snapshot) > engagedAt(best) ? snapshot : best,
  );

  return isLive(chosen, now) ? chosen : null;
};

/**
 * How many live sessions are blocked on the user, the one being shown included.
 *
 * A count rather than a flag, because one chat waiting and four chats waiting are
 * different situations and the panel has a pixel to say which.
 */
export const waitingCount = (snapshots: readonly SessionSnapshot[], now: number): number =>
  snapshots.filter((snapshot) => snapshot.status === "waiting" && isLive(snapshot, now)).length;

const forgetSession = async (id: string) => {
  await unlink(join(sessionsDir(), `${id}.json`)).catch(() => {});
};

// A session file outlives the session that wrote it - nothing is guaranteed to
// fire on a crash or a closed lid - so the ones no window could still cover are
// swept rather than left to accumulate for the life of the machine.
const KEEP = 24 * 60 * 60_000;

export const pruneSessions = async (now: number) => {
  for (const snapshot of await readSessions()) {
    if (now - snapshot.at > KEEP) await forgetSession(snapshot.id);
  }
};
