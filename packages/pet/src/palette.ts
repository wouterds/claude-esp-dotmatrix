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
  { upTo: 1, color: hex("#e04040") },
];

// What the face is tinted towards as the context window fills. The same red the
// gauge ends on, so the two halves of the panel agree about how bad it is.
export const EXHAUSTED = hex("#e04040");

export const WHITE = hex("#ffffff");
export const PINK = hex("#ff5f8f");
