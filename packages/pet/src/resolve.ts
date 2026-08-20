import { attentionElsewhere, pickSession, type SessionSnapshot } from "./sessions";
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
  now: number,
  window: number | null = null,
): Resolved => {
  const session = pickSession(snapshots, now);
  // An explicit override first, then whichever session was heard from last, then
  // nothing happening anywhere.
  const status = desire.status ?? session?.status ?? "idle";

  return {
    session,
    state: {
      status,
      mood: desire.mood ?? deriveMood(status, usage.fill),
      fill: usage.fill,
      tokens: usage.tokens,
      attention: attentionElsewhere(snapshots, now, session?.id ?? null),
      window,
    },
  };
};
