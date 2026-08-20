import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEFAULT_BRIGHTNESS,
  isRotation,
  MAX_BRIGHTNESS,
  type Rotation,
} from "@claude-status/matrix";
import { isMood, isStatus, type Mood, type Status } from "./state";

// A file rather than a socket. The daemon owns the port and everything else only
// ever wants to say one thing and leave, so a write is the whole client - which
// also means a hook fires and returns whether or not the pet is running, and
// nothing in a session ever waits on or fails because of the display.
export const home = () => process.env.CLAUDE_STATUS_HOME ?? join(homedir(), ".claude-status");

export const stateFile = () => join(home(), "state.json");

// Beside the state rather than in the daemon, because the tools report on the
// daemon and both sides would otherwise carry their own idea of where it is.
export const pidFile = () => join(home(), "daemon.pid");

export type Cell = [x: number, y: number, color: string];

export type Desire = {
  /**
   * An override. Null - the default - follows whichever session was heard from
   * last, which is what makes the pet work across every project at once rather
   * than only the one it was started from.
   */
  status: Status | null;
  /** Null derives it from the status and how full the window is. */
  mood: Mood | null;
  brightness: number;
  rotation: Rotation;
  /** The timestamp is the trigger - a repeat of the same name still plays. */
  antic: { name: string; at: number } | null;
  /** Set, the panel is exactly these cells and the pet is off duty. */
  paint: Cell[] | null;
};

export const DEFAULT_DESIRE: Desire = {
  status: null,
  mood: null,
  brightness: DEFAULT_BRIGHTNESS,
  rotation: 0,
  antic: null,
  paint: null,
};

const isCell = (value: unknown): value is Cell =>
  Array.isArray(value) &&
  value.length === 3 &&
  typeof value[0] === "number" &&
  typeof value[1] === "number" &&
  typeof value[2] === "string";

// The file is hand editable and written by hooks, so every field is checked
// rather than trusted. A daemon that dies on a stray comma takes the display
// with it and blames the last thing that touched the panel.
const sanitise = (raw: unknown): Desire => {
  if (typeof raw !== "object" || raw === null) return DEFAULT_DESIRE;

  const input = raw as Record<string, unknown>;
  const status = typeof input.status === "string" && isStatus(input.status) ? input.status : null;
  const mood = typeof input.mood === "string" && isMood(input.mood) ? input.mood : null;

  const brightness =
    typeof input.brightness === "number" && Number.isFinite(input.brightness)
      ? Math.max(0, Math.min(MAX_BRIGHTNESS, Math.round(input.brightness)))
      : DEFAULT_BRIGHTNESS;

  const rotation =
    typeof input.rotation === "number" && isRotation(input.rotation) ? input.rotation : 0;

  const antic = input.antic as Desire["antic"];
  const paint = Array.isArray(input.paint) ? input.paint.filter(isCell) : null;

  return {
    status,
    mood,
    brightness,
    rotation,
    antic:
      antic && typeof antic.name === "string" && typeof antic.at === "number"
        ? { name: antic.name, at: antic.at }
        : null,
    paint: paint && paint.length > 0 ? paint : null,
  };
};

// Unique per write, not just per process. Parallel tool calls fire their hooks
// at once, and a temp path shared between two writes in one process means one
// renames the file the other is still writing.
let writes = 0;

export const readDesire = async (file = stateFile()): Promise<Desire> => {
  const contents = await readFile(file, "utf8").catch(() => null);
  if (contents === null) return DEFAULT_DESIRE;

  try {
    return sanitise(JSON.parse(contents));
  } catch {
    return DEFAULT_DESIRE;
  }
};

export const writeDesire = async (patch: Partial<Desire>, file = stateFile()): Promise<Desire> => {
  const next = sanitise({ ...(await readDesire(file)), ...patch });

  await mkdir(dirname(file), { recursive: true });

  // Written beside the target and renamed over it, because the daemon reads this
  // several times a second and would otherwise catch a half written file. A
  // rename within one directory is atomic; a write in place is not.
  const temporary = `${file}.${process.pid}.${writes++}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
  await rename(temporary, file);

  return next;
};
