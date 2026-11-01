/**
 * Decodes a classic Windows .ico entry (BITMAPINFOHEADER, 4- or 8-bit palette, XOR
 * bitmap and AND transparency mask) into a PNG data URL. Browsers often render these
 * old 16-colour icons incorrectly, so we decode them ourselves.
 */
const cache = new Map<string, Promise<string>>();

export function icoToDataUrl(url: string, size = 32): Promise<string> {
  const key = `${url}#${size}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => decode(new Uint8Array(buf), size));
    cache.set(key, p);
  }
  return p;
}

function decode(b: Uint8Array, want: number): string {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const count = v.getUint16(4, true);
  let off = -1;
  for (let i = 0; i < count; i++) {
    const e = 6 + 16 * i;
    const w = b[e] || 256;
    if (off < 0 || w === want) off = v.getUint32(e + 12, true);
    if (w === want) break;
  }
  const hs = v.getUint32(off, true);
  const w = v.getInt32(off + 4, true);
  const h = v.getInt32(off + 8, true) / 2;
  const bpp = v.getUint16(off + 14, true);
  if (bpp !== 4 && bpp !== 8) throw new Error(`unsupported icon depth ${bpp}`);
  const pal = off + hs;
  const xor = pal + 4 * (1 << bpp);
  const xstride = ((w * bpp + 31) >> 5) << 2;
  const and = xor + xstride * h;
  const astride = ((w + 31) >> 5) << 2;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const row = h - 1 - y; // bottom-up
    for (let x = 0; x < w; x++) {
      const byte = b[xor + row * xstride + ((x * bpp) >> 3)];
      const idx = bpp === 4 ? (x & 1 ? byte & 15 : byte >> 4) : byte;
      const transparent = (b[and + row * astride + (x >> 3)] >> (7 - (x & 7))) & 1;
      const p = 4 * (y * w + x);
      const q = pal + 4 * idx;
      img.data[p] = b[q + 2];
      img.data[p + 1] = b[q + 1];
      img.data[p + 2] = b[q];
      img.data[p + 3] = transparent ? 0 : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
