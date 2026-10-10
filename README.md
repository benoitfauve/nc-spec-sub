# nc-spec-sub

Noise compensation for speech: a running-median noise estimate followed by power
spectral subtraction. Plain TypeScript, no runtime dependencies.

This is a first, minimal version of a re-creation of a 2001 real-time demo built at the
Speech and Image Group, University of Wales Swansea, as a side demo for:

- N. W. D. Evans, J. S. Mason, *Noise estimation without explicit speech, non-speech
  detection: a comparison of mean, modal and median based approaches*, Eurospeech 2001.
- N. W. D. Evans, J. S. Mason, B. Fauve, *Efficient real-time noise estimation without
  explicit speech, non-speech detection: an assessment on the AURORA corpus*, DSP 2002.

## Requirements

Node.js 23.6 or later. Node runs the `.ts` sources directly, so there is no build step.

## Usage

```bash
node src/main.ts in.wav out.wav [--alpha 2] [--beta 0.01]
```

Input must be 16-bit PCM WAV; only the first channel is used. Output is 16-bit mono at
the input sample rate.

| Option | Default | Meaning |
|---|---|---|
| `--alpha` | 2 | Over-subtraction factor on the noise power. Higher removes more noise and adds more musical noise. |
| `--beta` | 0.01 | Spectral floor, as a fraction of the noisy power (0.01 is -20 dB). |

## Example

`testdata/throwitaway.noisy.wav` is "throw it away" spoken in car noise (8 kHz, 2.8 s).

```bash
mkdir -p out
node src/main.ts testdata/throwitaway.noisy.wav out/throwitaway.clean.wav
```

The same thing as an npm script:

```bash
npm run demo
```

Try a gentler setting (alpha 0.25 gave the best speech recognition results in the
Eurospeech 2001 study) and compare by ear:

```bash
node src/main.ts testdata/throwitaway.noisy.wav out/throwitaway.a025.wav --alpha 0.25
```

## How it works

```
x → STFT → |X|² ─┬─────────────────────────────┐
                 └→ median of last 0.5 s → N   │
                                               ▼
               |Y|² = max(|X|² − α·N, β·|X|²)  → gain √(|Y|²/|X|²) → ISTFT → y
```

- **Frames**: 32 ms (256 samples at 8 kHz), 50% overlap, square-root Hann window on
  analysis and synthesis, so overlap-add reconstructs the signal exactly when no gain
  is applied.
- **Noise estimate**: for each frequency bin, the median of the power over the last
  0.5 s of frames (31 frames at 8 kHz). Speech occupies a given bin for less than half
  of that window most of the time, so the median follows the noise without a voice
  activity detector.
- **Subtraction**: the gain is applied to the complex spectrum, so the noisy phase is
  kept.

## Layout

```
src/
  main.ts      command-line entry point
  specsub.ts   noise estimate and spectral subtraction
  fft.ts       radix-2 FFT
  wav.ts       16-bit PCM WAV read and write
testdata/      sample recording
```

## Development

```bash
npm install        # TypeScript and Node types, for type checking only
npm run typecheck
```

## Licence

Code: MIT, see `LICENSE`.

`testdata/throwitaway.noisy.wav`: recorded in 2001 by Benoît Fauve and the Speech and
Image Group (SIG), University of Wales Swansea. CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/).
