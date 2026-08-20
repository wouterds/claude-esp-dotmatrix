import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { home, pidFile } from "@claude-status/pet";

const isRunning = (pid: number) => {
  try {
    // Signal 0 checks for the process without touching it.
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

/**
 * Two daemons on one port both write frames and the panel tears between them,
 * which looks like a bad cable rather than like a second process. The skill
 * starts the daemon on every session, so this is the normal case, not an edge.
 */
export const claim = async (): Promise<number | null> => {
  const file = pidFile();
  const existing = Number(await readFile(file, "utf8").catch(() => ""));

  if (existing && existing !== process.pid && isRunning(existing)) return existing;

  await mkdir(home(), { recursive: true });
  await writeFile(file, String(process.pid));

  return null;
};

export const release = async () => {
  await unlink(pidFile()).catch(() => {});
};
