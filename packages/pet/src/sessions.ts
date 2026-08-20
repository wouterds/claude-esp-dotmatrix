import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isStatus, type Status } from "./state";
import { home } from "./store";

// One file per session rather than one status for the machine. Several sessions
// run at once and are switched between, so a single field means whichever fired
// a hook last wins - a finished session pins the panel on "done" while another
// is still working, and nothing ever decays back.
export const sessionsDir = () => join(home(), "sessions");

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
 * The session the panel speaks for: of the ones still live, whichever the user
 * typed into most recently.
 *
 * Ranking on plain activity instead makes two busy sessions fight - both fire
 * hooks several times a second, so the panel flickers between two statuses and
 * settles on neither. The last prompt is a stable key: it does not move while a
 * session grinds, so the session being worked in keeps the panel until the user
 * moves, and the other drops out on its own once it goes quiet.
 *
 * Still recency rather than priority. A session parked on a prompt must not stop
 * the panel showing the one being worked in - `attentionElsewhere` covers that.
 */
export const pickSession = (
  snapshots: readonly SessionSnapshot[],
  now: number,
): SessionSnapshot | null => {
  const live = snapshots.filter((snapshot) => isLive(snapshot, now));
  if (live.length === 0) return null;

  return live.reduce((best, snapshot) => (engagedAt(snapshot) > engagedAt(best) ? snapshot : best));
};

/**
 * Whether some *other* live session is blocked on the user. Answering it here
 * rather than folding it into the pick is what lets the panel say two things at
 * once: what is being worked on, and that something else is waiting.
 */
export const attentionElsewhere = (
  snapshots: readonly SessionSnapshot[],
  now: number,
  exclude: string | null,
): boolean =>
  snapshots.some(
    (snapshot) => snapshot.id !== exclude && snapshot.status === "waiting" && isLive(snapshot, now),
  );

export const writeSession = async (snapshot: Omit<SessionSnapshot, "id">, id: string) => {
  const directory = sessionsDir();
  await mkdir(directory, { recursive: true });

  const file = join(directory, `${id}.json`);
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(snapshot)}\n`);
  await rename(temporary, file);
};

export const forgetSession = async (id: string) => {
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
