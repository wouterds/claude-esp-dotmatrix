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
  at: number;
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
        transcript: typeof raw.transcript === "string" ? raw.transcript : null,
        cwd: typeof raw.cwd === "string" ? raw.cwd : null,
      });
    } catch {
      // A snapshot caught mid-write. The next poll is 120ms away.
    }
  }

  return snapshots;
};

/**
 * The session the panel speaks for: whichever was heard from last. Recency
 * rather than priority, because a session parked on a prompt should not stop the
 * panel showing the one actually being worked in - that is what `attentionElsewhere`
 * is for.
 */
export const pickSession = (
  snapshots: readonly SessionSnapshot[],
  now: number,
): SessionSnapshot | null => {
  const live = snapshots.filter((snapshot) => isLive(snapshot, now));
  if (live.length === 0) return null;

  return live.reduce((best, snapshot) => (snapshot.at > best.at ? snapshot : best));
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
