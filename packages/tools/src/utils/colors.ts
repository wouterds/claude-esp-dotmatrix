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

// The gauge's own thresholds, so a printed percentage is coloured the same way
// the panel colours it. Amber where the mood tires, red where it gives out.
const TIRED = 0.75;
const SPENT = 0.95;

export const pressure = (value: string, fill: number) => {
  if (fill >= SPENT) return pc.red(value);
  if (fill >= TIRED) return pc.yellow(value);

  return pc.green(value);
};
