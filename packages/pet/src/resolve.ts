import type { Limits } from "./limits";
import { strainOf } from "./scenes";
import { pickSession, type SessionSnapshot, waitingCount } from "./sessions";
import { deriveMood, type PetState } from "./state";
import type { Desire } from "./store";
import type { Usage } from "./usage";

export type Resolved = {
  state: PetState;
  /** The session the panel is speaking for, if any. */
  session: SessionSnapshot | null;
};

/**
 * What the panel should show, from everything that has a say in it. Shared
 * rather than written twice, because the terminal preview exists to be trusted
 * as the panel - one drifting from the other makes it worse than nothing.
 */
export const resolveState = (
  desire: Desire,
  snapshots: readonly SessionSnapshot[],
  usage: Pick<Usage, "tokens" | "fill">,
  limits: Limits,
  now: number,
): Resolved => {
  const session = pickSession(snapshots, now);
  const fiveHour = limits.fiveHour?.used ?? null;
  const sevenDay = limits.sevenDay?.used ?? null;
  // An explicit override first, then whichever session was heard from last, then
  // nothing happening anywhere.
  const status = desire.status ?? session?.status ?? "idle";

  return {
    session,
    state: {
      status,
      mood: desire.mood ?? deriveMood(status, usage.fill, strainOf(fiveHour, sevenDay)),
      fill: usage.fill,
      tokens: usage.tokens,
      waiting: waitingCount(snapshots, now),
      // Account-wide, so unlike the context fill above these do not belong to
      // the session that was picked - the same two numbers whoever is speaking.
      fiveHour,
      sevenDay,
    },
  };
};
