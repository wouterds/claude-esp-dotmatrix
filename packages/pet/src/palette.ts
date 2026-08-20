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

export const GAUGE_LOW = hex("#5fc97e");
export const GAUGE_MID = hex("#e8c547");
export const GAUGE_HIGH = hex("#e05252");

export const WHITE = hex("#ffffff");
export const PINK = hex("#ff5f8f");

// Dim, because a cheek is a hint rather than a feature. At full strength two
// pink pixels beside the eyes read as part of the expression.
export const BLUSH = scale(hex("#ff5f8f"), 0.35);
