import type { Frame } from "@claude-status/matrix";
import { ANTICS, anticNamed, anticWeight, fatigueOf, type Scene, STATUS_SCENE } from "./scenes";
import type { PetState, Status } from "./state";

/** Average seconds between spontaneous antics, with room left in the window. */
const DEFAULT_INTERVAL = 40;

// How the interval stretches as the window fills: a little under the mean while
// there is room, three times it once there is none.
const RESTLESS = 0.6;
const SLUGGISH = 3;

// Two statuses the pet does not talk over. An error and a prompt waiting on the
// user are the only things on here that need acting on, and a dance covering
// either of them is the difference between a pet and a distraction.
const NO_INTERRUPTIONS: readonly Status[] = ["error", "waiting"];

// Punctuation on arriving at a status, rather than something to wait 40 seconds
// for. Finishing is worth a tick the moment it happens.
const ARRIVALS: Partial<Record<Status, string>> = {
  done: "check",
};

export type DirectorOptions = {
  interval?: number;
  random?: () => number;
};

export type Director = {
  paint: (frame: Frame, now: number, state: PetState) => void;
  play: (name: string, now: number) => boolean;
  playing: () => string;
};

export const createDirector = ({
  interval = DEFAULT_INTERVAL,
  random = Math.random,
}: DirectorOptions = {}): Director => {
  let active: { scene: Scene; startedAt: number; seed: number } | null = null;
  let nextAt: number | null = null;
  let lastStatus: Status | null = null;

  // Spread around the mean, so the pet does not tick like a metronome - and
  // stretched as the window fills. A session with room to spare should be playing
  // up; one that is nearly out of it should be mostly getting on with things.
  const schedule = (now: number, fatigue: number) => {
    nextAt = now + interval * (0.5 + random()) * (RESTLESS + (SLUGGISH - RESTLESS) * fatigue);
  };

  const start = (scene: Scene, now: number, fatigue: number) => {
    // Drawn once per playing rather than per frame, or a scene using it would
    // strobe instead of holding one colour for its run.
    active = { scene, startedAt: now, seed: random() };
    schedule(now, fatigue);
  };

  const pick = (fatigue: number) => {
    const total = ANTICS.reduce((sum, antic) => sum + anticWeight(antic, fatigue), 0);
    let ticket = random() * total;

    for (const antic of ANTICS) {
      ticket -= anticWeight(antic, fatigue);
      if (ticket < 0) return antic;
    }

    return ANTICS[ANTICS.length - 1];
  };

  const paint: Director["paint"] = (frame, now, state) => {
    const fatigue = fatigueOf(state.fill);

    if (nextAt === null) schedule(now, fatigue);

    const blocked = NO_INTERRUPTIONS.includes(state.status);

    if (state.status !== lastStatus) {
      const arrival = ARRIVALS[state.status];
      lastStatus = state.status;

      if (blocked) active = null;
      else if (arrival) start(anticNamed(arrival) ?? STATUS_SCENE, now, fatigue);
    }

    if (active && now - active.startedAt >= (active.scene.duration ?? Number.POSITIVE_INFINITY)) {
      active = null;
    }

    if (!active && !blocked && nextAt !== null && now >= nextAt) start(pick(fatigue), now, fatigue);

    const scene = active?.scene ?? STATUS_SCENE;
    // The status scene is handed the clock rather than an elapsed time, so its
    // breathing and its blink carry on across an antic instead of restarting.
    const elapsed = active ? now - active.startedAt : now;

    scene.paint(frame, elapsed, state, active?.seed ?? 0);
  };

  const play: Director["play"] = (name, now) => {
    const antic = anticNamed(name);
    if (!antic) return false;

    start(antic, now, 0);

    return true;
  };

  return { paint, play, playing: () => active?.scene.name ?? STATUS_SCENE.name };
};
