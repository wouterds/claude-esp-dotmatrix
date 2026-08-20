import { type Frame, HEIGHT, WIDTH } from "@claude-status/matrix";

const RESET = "\x1b[0m";
const DARK = "\x1b[38;5;238m";

// Two cells per pixel, because a terminal cell is about twice as tall as it is
// wide and a square panel drawn one cell per pixel comes out squashed.
const ON = "██";
const OFF = "··";

/**
 * The panel as the scene meant it, before gamma. Correcting here would show what
 * the LEDs are driven at rather than what was drawn, which is the wrong half for
 * judging whether a face reads.
 */
export const renderFrame = (frame: Frame): string => {
  const rows: string[] = [];

  for (let y = 0; y < HEIGHT; y++) {
    let row = "";

    for (let x = 0; x < WIDTH; x++) {
      const [r, g, b] = frame.get(x, y);
      row += r + g + b < 12 ? `${DARK}${OFF}${RESET}` : `\x1b[38;2;${r};${g};${b}m${ON}${RESET}`;
    }

    rows.push(row);
  }

  return rows.join("\n");
};

export const rewind = (lines: number) => `\x1b[${lines}A`;
