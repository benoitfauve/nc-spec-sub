// Minimal WAV I/O: reads 16-bit PCM (first channel), writes 16-bit mono PCM.

import { readFileSync, writeFileSync } from "node:fs";

export interface Audio {
  fs: number;
  x: Float64Array; // samples in [-1, 1)
}

export function readWav(path: string): Audio {
  const b = readFileSync(path);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${path}: not a RIFF/WAVE file`);
  }
  let pos = 12;
  let fs = 0;
  let channels = 1;
  let bits = 16;
  while (pos + 8 <= b.length) {
    const id = b.toString("ascii", pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") {
      const format = b.readUInt16LE(body);
      channels = b.readUInt16LE(body + 2);
      fs = b.readUInt32LE(body + 4);
      bits = b.readUInt16LE(body + 14);
      if (format !== 1 || bits !== 16) {
        throw new Error(`${path}: only 16-bit PCM is supported (format ${format}, ${bits} bits)`);
      }
    } else if (id === "data") {
      const n = Math.floor(size / (2 * channels));
      const x = new Float64Array(n);
      for (let i = 0; i < n; i++) x[i] = b.readInt16LE(body + i * 2 * channels) / 32768;
      return { fs, x };
    }
    pos = body + size + (size & 1); // chunks are word-aligned
  }
  throw new Error(`${path}: no data chunk`);
}

export function writeWav(path: string, { fs, x }: Audio): void {
  const bytes = x.length * 2;
  const b = Buffer.alloc(44 + bytes);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + bytes, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(fs, 24);
  b.writeUInt32LE(fs * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(bytes, 40);
  for (let i = 0; i < x.length; i++) {
    const s = Math.max(-1, Math.min(1, x[i]));
    b.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  writeFileSync(path, b);
}
