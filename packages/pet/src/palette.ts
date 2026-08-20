import { type Color, hex, scale } from "@claude-status/matrix";
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

export const WHITE = hex("#ffffff");
export const PINK = hex("#ff5f8f");

// Dim, because a cheek is a hint rather than a feature. At full strength two pink
// pixels beside the eyes read as part of the expression.
export const BLUSH = scale(hex("#ff5f8f"), 0.35);
