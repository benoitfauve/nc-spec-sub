/** Minimal RIFF/WAVE reader and writer: PCM 8/16/24/32-bit and IEEE float 32/64. */

export interface WavData {
  sampleRate: number;
  /** One Float32Array per channel, samples in [-1, 1]. */
  channels: Float32Array[];
}

export function readWav(bytes: Uint8Array): WavData {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a RIFF/WAVE file");

  let format = 0;
  let numChannels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataOffset = -1;
  let dataLength = 0;
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = tag(pos);
    const size = dv.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === "fmt ") {
      format = dv.getUint16(body, true);
      numChannels = dv.getUint16(body + 2, true);
      sampleRate = dv.getUint32(body + 4, true);
      bits = dv.getUint16(body + 14, true);
      if (format === 0xfffe && size >= 26) format = dv.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === "data") {
      dataOffset = body;
      dataLength = Math.min(size, bytes.length - body); // tolerate truncated files
    }
    pos = body + size + (size & 1);
  }
  if (!numChannels || dataOffset < 0) throw new Error("missing fmt or data chunk");
  if (format !== 1 && format !== 3) throw new Error(`unsupported WAV format ${format}`);

  const bytesPerSample = bits / 8;
  const frames = Math.floor(dataLength / (bytesPerSample * numChannels));
  const channels = Array.from({ length: numChannels }, () => new Float32Array(frames));
  let o = dataOffset;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let v: number;
      if (format === 3) v = bits === 64 ? dv.getFloat64(o, true) : dv.getFloat32(o, true);
      else if (bits === 8) v = (bytes[o] - 128) / 128;
      else if (bits === 16) v = dv.getInt16(o, true) / 32768;
      else if (bits === 24) v = (((bytes[o + 2] << 24) | (bytes[o + 1] << 16) | (bytes[o] << 8)) >> 8) / 8388608;
      else if (bits === 32) v = dv.getInt32(o, true) / 2147483648;
      else throw new Error(`unsupported bit depth ${bits}`);
      channels[ch][i] = v;
      o += bytesPerSample;
    }
  }
  return { sampleRate, channels };
}

/** Writes mono or multichannel audio. 16-bit PCM (default) or 32-bit float. */
export function writeWav(
  channels: Float32Array[] | Float32Array,
  sampleRate: number,
  encoding: "pcm16" | "float32" = "pcm16",
): Uint8Array {
  const chans = Array.isArray(channels) ? channels : [channels];
  const numChannels = chans.length;
  const frames = chans[0]?.length ?? 0;
  const bytesPerSample = encoding === "pcm16" ? 2 : 4;
  const dataLength = frames * numChannels * bytesPerSample;
  const out = new Uint8Array(44 + dataLength);
  const dv = new DataView(out.buffer);
  const put = (o: number, s: string) => {
    for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i);
  };
  put(0, "RIFF");
  dv.setUint32(4, 36 + dataLength, true);
  put(8, "WAVE");
  put(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, encoding === "pcm16" ? 1 : 3, true);
  dv.setUint16(22, numChannels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  dv.setUint16(32, numChannels * bytesPerSample, true);
  dv.setUint16(34, bytesPerSample * 8, true);
  put(36, "data");
  dv.setUint32(40, dataLength, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const v = chans[ch][i];
      if (encoding === "pcm16") {
        const s = Math.max(-1, Math.min(1, v));
        dv.setInt16(o, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
      } else {
        dv.setFloat32(o, v, true);
      }
      o += bytesPerSample;
    }
  }
  return out;
}

/** Averages all channels into one. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}
