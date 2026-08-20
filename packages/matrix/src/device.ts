import { SerialPort } from "serialport";
import type { Frame, Rotation } from "./frame";
import {
  DEFAULT_BRIGHTNESS,
  encodeBrightness,
  encodeClear,
  encodeFrame,
  encodePing,
} from "./protocol";

// The S3 talks over its own USB-Serial-JTAG peripheral, so the board announces
// itself as Espressif rather than as a UART bridge. Matching the vendor keeps
// this working across the FTDI and CH340 clones of the same module.
const ESPRESSIF_VENDOR_ID = "303a";

// Ignored by a USB CDC endpoint, which has no line to run at any rate, but
// serialport insists on being told one.
const BAUD_RATE = 115200;

export const findBoard = async (): Promise<string | null> => {
  const ports = await SerialPort.list();
  const board = ports.find((port) => port.vendorId?.toLowerCase() === ESPRESSIF_VENDOR_ID);

  return board?.path ?? null;
};

export type MatrixOptions = {
  path?: string;
  brightness?: number;
  rotation?: Rotation;
};

export type Matrix = {
  readonly path: string;
  isOpen: () => boolean;
  show: (frame: Frame) => void;
  setBrightness: (level: number) => void;
  setRotation: (rotation: Rotation) => void;
  clear: () => void;
  ping: (timeoutMs?: number) => Promise<string>;
  close: () => Promise<void>;
};

export const openMatrix = async (options: MatrixOptions = {}): Promise<Matrix> => {
  const path = options.path ?? (await findBoard());
  if (!path) {
    throw new Error("no esp32 matrix found on usb - check the cable");
  }

  let rotation = options.rotation ?? 0;
  let draining = false;

  const port = await new Promise<SerialPort>((resolve, reject) => {
    const opening = new SerialPort({ path, baudRate: BAUD_RATE }, (error) => {
      if (error) reject(error);
      else resolve(opening);
    });
  });

  port.on("drain", () => {
    draining = false;
  });

  // Without a listener the port errors as an unhandled event and takes the
  // process with it, which for an unplugged cable is the wrong ending - the
  // daemon wants to notice and wait for it to come back.
  port.on("error", () => port.destroy());

  const lines: string[] = [];
  const waiting: ((line: string) => void)[] = [];
  let pending = "";

  port.on("data", (chunk: Buffer) => {
    pending += chunk.toString("utf8");

    const parts = pending.split("\n");
    pending = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line) continue;

      const next = waiting.shift();
      if (next) next(line);
      else lines.push(line);
    }
  });

  const write = (packet: Uint8Array) => {
    if (!port.isOpen || draining) return;

    draining = !port.write(Buffer.from(packet));
  };

  const matrix: Matrix = {
    path,
    isOpen: () => port.isOpen,
    // A frame is dropped rather than queued when the port is behind. The next
    // one is 33ms away and more current, and a queue that grows turns a busy
    // moment into an animation running visibly late for the rest of the session.
    show: (frame) => write(encodeFrame(frame.toBytes(rotation))),
    setBrightness: (level) => write(encodeBrightness(level)),
    setRotation: (next) => {
      rotation = next;
    },
    clear: () => write(encodeClear()),
    ping: (timeoutMs = 1000) =>
      new Promise((resolve, reject) => {
        const buffered = lines.shift();
        if (buffered) return resolve(buffered);

        const timer = setTimeout(() => {
          waiting.length = 0;
          reject(new Error("board did not answer a ping"));
        }, timeoutMs);

        waiting.push((line) => {
          clearTimeout(timer);
          resolve(line);
        });

        write(encodePing());
      }),
    close: () =>
      new Promise((resolve) => {
        if (!port.isOpen) return resolve();

        port.close(() => resolve());
      }),
  };

  matrix.setBrightness(options.brightness ?? DEFAULT_BRIGHTNESS);

  return matrix;
};
