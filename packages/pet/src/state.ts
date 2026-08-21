export const STATUSES = [
  "idle",
  "thinking",
  "working",
  "reading",
  "running",
  "waiting",
  "error",
  "done",
] as const;

export type Status = (typeof STATUSES)[number];

export const MOODS = ["happy", "focused", "excited", "tired", "annoyed", "zen", "dead"] as const;

export type Mood = (typeof MOODS)[number];

export type PetState = {
  status: Status;
  mood: Mood;
  /** How full the context window is, 0 to 1. */
  fill: number;
  tokens: number;
  /** How many sessions are blocked on the user. */
  waiting: number;
  /**
   * How much of the rolling 5h quota is spent, 0 to 1, and null when unknown.
   *
   * Account-wide rather than per session, unlike `fill` - so it is the same
   * number whichever chat the panel is speaking for, and a row can show it
   * without asking which session it belongs to.
   */
  fiveHour: number | null;
  /** How much of the 7 day quota is spent, 0 to 1. Null when unknown. */
  sevenDay: number | null;
};

export const isStatus = (value: string): value is Status => STATUSES.includes(value as Status);

export const isMood = (value: string): value is Mood => MOODS.includes(value as Mood);

// Mood is the pet's own reading of how the session is going, so it comes from
// how much room is left rather than from what the session is doing. A model
// four fifths of the way through its context is genuinely running out of head,
// and that is the thing worth showing on a face.
export const deriveMood = (status: Status, fill: number, strain = 0): Mood => {
  if (status === "error") return "annoyed";
  if (fill >= 0.95) return "dead";
  if (status === "done") return "happy";
  // A quota near gone is as good a reason to be tired as a full window, and it
  // outranks the cheerful moods below - there is no being excited about a
  // session that is nearly out of runway.
  if (fill >= 0.75 || strain > 0) return "tired";
  if (status === "idle" || status === "waiting") return "zen";
  if (status === "running") return "excited";

  return "focused";
};
