import { createFrame, hex, type Matrix, openMatrix, type Rotation } from "@claude-status/matrix";
import {
  CONTEXT_LIMIT,
  createDirector,
  DEFAULT_DESIRE,
  type Desire,
  findLatestTranscript,
  pruneSessions,
  readDesire,
  readSessions,
  readUsage,
  readWindow,
  resolveState,
  type SessionSnapshot,
  type Usage,
} from "@claude-status/pet";
import { claim, release } from "./lock";

const FPS = Number(process.env.CLAUDE_STATUS_FPS ?? 40);
const DESIRE_INTERVAL = 120;
const SESSION_INTERVAL = 300;
const USAGE_INTERVAL = 2_000;
// A five hour bar moves one pixel every thirty-seven minutes.
const WINDOW_INTERVAL = 30_000;
const RECONNECT_INTERVAL = 2_000;
const PRUNE_INTERVAL = 5 * 60_000;

const started = Date.now();

// One clock for the render loop and for scheduling antics, so an antic asked for
// between two frames is timed against the same seconds the scene is drawn on.
const clock = () => (Date.now() - started) / 1_000;

const director = createDirector({
  interval: Number(process.env.CLAUDE_STATUS_ANTIC_INTERVAL ?? 40),
});

let matrix: Matrix | null = null;
let connecting = false;
let desire: Desire = DEFAULT_DESIRE;
let usage: Usage = { tokens: 0, fill: 0, limit: CONTEXT_LIMIT };
let snapshots: SessionSnapshot[] = [];
let session: SessionSnapshot | null = null;
let sessionWindow: number | null = null;
let anticAt: number | null = null;
let applied: { brightness: number; rotation: Rotation } | null = null;

const connect = async () => {
  if (matrix?.isOpen() || connecting) return;

  connecting = true;
  try {
    matrix = await openMatrix({ brightness: desire.brightness, rotation: desire.rotation });
    applied = { brightness: desire.brightness, rotation: desire.rotation };
    console.log(`claude-status: on ${matrix.path}`);

    const banner = await matrix.ping().catch(() => "no answer");
    console.log(`claude-status: board says ${banner}`);

    director.play("burst", clock());
  } catch (error) {
    matrix = null;
    console.error(`claude-status: ${(error as Error).message}`);
  } finally {
    connecting = false;
  }
};

const pollDesire = async () => {
  const next = await readDesire();
  const first = anticAt === null;
  desire = next;

  // The first read adopts whatever antic the file was left holding rather than
  // playing it, or every start would replay the last session's last request.
  if (next.antic && (first || next.antic.at !== anticAt)) {
    if (!first) director.play(next.antic.name, clock());
    anticAt = next.antic.at;
  } else if (first) {
    anticAt = 0;
  }
};

const pollSessions = async () => {
  snapshots = await readSessions();
};

// Time based and exact. The real session-window figure is fetched from the API
// and cached nowhere, so what is shown is how far through the window we are -
// which is the half that says when the limit lifts.
const pollWindow = async () => {
  sessionWindow = (await readWindow())?.fraction ?? null;
};

const pollUsage = async () => {
  // The session being shown, so the gauge belongs to the face above it. Falling
  // back to the newest transcript covers a session whose hooks are not wired.
  const transcript = session?.transcript ?? (await findLatestTranscript());
  if (!transcript) return;

  const reading = await readUsage(transcript);
  if (reading) usage = reading;
};

const render = () => {
  if (!matrix?.isOpen()) {
    matrix = null;

    return;
  }

  if (applied?.brightness !== desire.brightness) matrix.setBrightness(desire.brightness);
  if (applied?.rotation !== desire.rotation) matrix.setRotation(desire.rotation);
  applied = { brightness: desire.brightness, rotation: desire.rotation };

  const frame = createFrame();

  if (desire.paint) {
    // A hand painted panel is a takeover, not an overlay - the whole point of
    // setting a pixel is seeing that pixel and nothing else.
    for (const [x, y, color] of desire.paint) {
      try {
        frame.set(x, y, hex(color));
      } catch {
        // A colour that will not parse is skipped rather than blanking the frame.
      }
    }
  } else {
    const resolved = resolveState(desire, snapshots, usage, Date.now(), sessionWindow);

    // A sweep when the panel changes hands, so a switch is something you see
    // rather than something you notice the aftermath of. Only on a move between
    // two sessions: arriving from nothing is the pet waking up, not a switch.
    if (resolved.session && session && resolved.session.id !== session.id) {
      director.play("switch", clock());
    }

    session = resolved.session;

    director.paint(frame, clock(), resolved.state);
  }

  matrix.show(frame);
};

const main = async () => {
  const holder = await claim();
  if (holder) {
    console.error(`claude-status: already running as pid ${holder}`);
    process.exit(1);
  }

  await pruneSessions(Date.now());
  await Promise.all([pollDesire(), pollSessions()]);
  await Promise.all([pollUsage(), pollWindow()]);
  await connect();

  const timers = [
    setInterval(render, Math.round(1_000 / FPS)),
    setInterval(pollDesire, DESIRE_INTERVAL),
    setInterval(pollSessions, SESSION_INTERVAL),
    setInterval(pollUsage, USAGE_INTERVAL),
    setInterval(pollWindow, WINDOW_INTERVAL),
    setInterval(connect, RECONNECT_INTERVAL),
    setInterval(() => pruneSessions(Date.now()), PRUNE_INTERVAL),
  ];

  // Ctrl-C on a terminal that is also being torn down delivers both signals, and
  // the teardown below awaits - so without this it runs twice and the second
  // pass closes a port the first already took away.
  let stopping = false;

  const stop = async () => {
    if (stopping) return;
    stopping = true;

    console.log("claude-status: stopping, clearing the panel");
    for (const timer of timers) clearInterval(timer);

    // Without this the last frame stays lit for as long as the board has power,
    // so a stopped daemon is indistinguishable from a frozen one.
    matrix?.clear();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await matrix?.close();
    await release();

    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
};

await main();
