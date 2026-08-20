import { type Color, hex } from "@claude-status/matrix";
import type { Status } from "./state";

export const STATUS_COLORS: Record<Status, Color> = {
  idle: hex("#cc785c"),
  thinking: hex("#7c9cf5"),
  working: hex("#d9a757"),
  reading: hex("#5fb8a0"),
  running: hex("#b57edc"),
  waiting: hex("#e8c547"),
  error: hex("#e05252"),
  done: hex("#5fc97e"),
};

// Four bands, read at a glance rather than interpolated - the point of the row is
// the number, and a colour halfway between two stops makes the reader work out
// which side of a boundary they are on.
//
// The green is deliberately short of blue. #5fc97e carried 126 of blue and read
// as teal on the panel, because at these brightnesses the blue channel pulls
// harder than its number suggests.
export const GAUGE_BANDS: readonly { readonly upTo: number; readonly color: Color }[] = [
  { upTo: 0.4, color: hex("#4ec95a") },
  { upTo: 0.6, color: hex("#e8d047") },
  { upTo: 0.8, color: hex("#e8933a") },
  { upTo: 1, color: hex("#c26230") },
];

// What the face is tinted towards as the context window fills. The same red the
// gauge ends on, so the two halves of the panel agree about how bad it is.
//
// Warm rather than bright. A saturated red reads as an alarm - something has gone
// wrong - where a filling window is only the session getting on with it.
//
// It looks almost brown written down, and that is the gamma. Correction squashes
// the small channels hardest, so #b0392a - which reads as a perfectly reasonable
// dark red on a screen - arrives at the LEDs as rgb(113,9,5): pure red with the
// green all but gone. Getting orange *out* means putting far more green *in* than
// the source colour appears to want. Judge these by the wire values, not by eye.
export const EXHAUSTED = hex("#c26230");

export const WHITE = hex("#ffffff");
export const PINK = hex("#ff5f8f");
