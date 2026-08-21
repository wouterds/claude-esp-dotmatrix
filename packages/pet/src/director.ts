import type { Frame } from "@claude-status/matrix";
import {
  ANTICS,
  anticNamed,
  anticWeight,
  drawAlarm,
  isSpent,
  type Scene,
  STATUS_SCENE,
  wearOf,
} from "./scenes";
import type { PetState, Status } from "./state";

/** Average seconds between spontaneous antics, with room left in the window. */
const DEFAULT_INTERVAL = 40;

// How the interval stretches as the window fills: a little under the mean while
// there is room, three times it once there is none.
const RESTLESS = 0.6;
const SLUGGISH = 3;

// The one status the pet does not talk over: a red flashing face *is* the
// message, and an antic replaces the face.
//
// Waiting used to be in here too, and that was a bug rather than a policy. Claude
// Code raises a notification once a session has been idle a minute, so sitting at
// the desk doing nothing set the status to waiting and stopped the antics
// altogether - the panel went still exactly when there was most reason for it not
// to. The corner dot is an overlay now, so nothing is hidden by letting them run.
const NO_INTERRUPTIONS: readonly Status[] = ["error"];

// Punctuation on arriving at a status, rather than something to wait 40 seconds
// for. Finishing is worth a tick the moment it happens.
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
  let active: { scene: Scene; startedAt: number; seed: number; mirrored: boolean } | null = null;
  // Alternates across playings of any scene that asks for it, which is why it
  // lives here rather than in the scene: a scene sees one frame at a time.
  let mirrored = false;
  let nextAt: number | null = null;
  let lastStatus: Status | null = null;

  // Spread around the mean, so the pet does not tick like a metronome - and
  // stretched as the window fills. A session with room to spare should be playing
  // up; one that is nearly out of it should be mostly getting on with things.
  const schedule = (now: number, fatigue: number) => {
    nextAt = now + interval * (0.5 + random()) * (RESTLESS + (SLUGGISH - RESTLESS) * fatigue);
  };

  const start = (scene: Scene, now: number, fatigue: number) => {
    if (scene.mirrors) mirrored = !mirrored;

    // Drawn once per playing rather than per frame, or a scene using them would
    // strobe instead of holding one colour and one direction for its run.
    active = { scene, startedAt: now, seed: random(), mirrored };
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
    const fatigue = wearOf(state);

    if (nextAt === null) schedule(now, fatigue);

    // A spent quota holds the panel the same way an error does. Nothing is
    // going to run until the window turns over, so an antic on top of it would
    // be the pet playing up about the one thing it cannot do anything about.
    const blocked = NO_INTERRUPTIONS.includes(state.status) || isSpent(state);

    if (state.status !== lastStatus) {
      lastStatus = state.status;

      if (blocked) active = null;
    }

    if (active && now - active.startedAt >= (active.scene.duration ?? Number.POSITIVE_INFINITY)) {
      active = null;
    }

    if (!active && !blocked && nextAt !== null && now >= nextAt) start(pick(fatigue), now, fatigue);

    const scene = active?.scene ?? STATUS_SCENE;
    // The status scene is handed the clock rather than an elapsed time, so its
    // breathing and its blink carry on across an antic instead of restarting.
    const elapsed = active ? now - active.startedAt : now;

    scene.paint(frame, elapsed, state, active?.seed ?? 0, active?.mirrored ?? false);

    // Over the top of whatever just painted, and on the wall clock rather than the
    // scene's, so it blinks at one rate throughout.
    drawAlarm(frame, state.waiting, now);
  };

  const play: Director["play"] = (name, now) => {
    const antic = anticNamed(name);
    if (!antic) return false;

    start(antic, now, 0);

    return true;
  };

  return { paint, play, playing: () => active?.scene.name ?? STATUS_SCENE.name };
};
