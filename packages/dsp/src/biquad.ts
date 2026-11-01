import type { Biquad } from "./iir-design.ts";

/**
 * Cascade of biquads in transposed Direct Form II. State is kept between calls,
 * which fixes the 2001 bug where part of the filter memory was lost every block.
 */
export class BiquadCascade {
  private sections: Biquad[];
  private s1: Float64Array;
  private s2: Float64Array;

  constructor(sections: Biquad[] = []) {
    this.sections = sections;
    this.s1 = new Float64Array(sections.length);
    this.s2 = new Float64Array(sections.length);
  }

  /** Replaces coefficients. State is kept when the number of sections is unchanged, to avoid clicks. */
  setSections(sections: Biquad[]): void {
    if (sections.length !== this.sections.length) {
      this.s1 = new Float64Array(sections.length);
      this.s2 = new Float64Array(sections.length);
    }
    this.sections = sections;
  }

  reset(): void {
    this.s1.fill(0);
    this.s2.fill(0);
  }

  get length(): number {
    return this.sections.length;
  }

  /** Filters `buf` in place over [0, n). */
  process(buf: Float32Array, n = buf.length): void {
    const { sections, s1, s2 } = this;
    for (let k = 0; k < sections.length; k++) {
      const { b0, b1, b2, a1, a2 } = sections[k];
      let z1 = s1[k];
      let z2 = s2[k];
      for (let i = 0; i < n; i++) {
        const x = buf[i];
        const y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        buf[i] = y;
      }
      s1[k] = z1;
      s2[k] = z2;
    }
  }
}
