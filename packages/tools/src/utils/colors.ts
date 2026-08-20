import pc from "picocolors";

// Every helper takes an already padded string. The escape codes are invisible
// but still counted by padEnd, so tinting before padding pushes every column
// after it out of line.

export const heading = (value: string) => pc.dim(value);

export const name = (value: string) => pc.bold(value);

export const muted = (value: string) => pc.dim(value);

export const figure = (value: string) => pc.bold(value);

export const good = (value: string) => pc.green(value);

export const bad = (value: string) => pc.red(value);

// The gauge's own band edges, so a printed percentage is coloured the way the
// panel colours it. A terminal has no orange, so the middle two bands share
// yellow.
export const pressure = (value: string, fill: number) => {
  if (fill > 0.8) return pc.red(value);
  if (fill > 0.4) return pc.yellow(value);

  return pc.green(value);
};
