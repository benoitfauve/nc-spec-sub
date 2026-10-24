# Audio attribution

The audio files in `testdata/` are **not** covered by the project's MIT licence
(see `/LICENSE`). Each file keeps the licence of its source, listed below.

## Noise clips from MUSAN (`noise-musan/`)

These clips come from the noise portion of the **MUSAN corpus**:

> David Snyder, Guoguo Chen and Daniel Povey, *MUSAN: A Music, Speech, and Noise Corpus*,
> 2015, arXiv:1510.08484. https://www.openslr.org/17/

MUSAN is distributed under the Creative Commons Attribution 4.0 International licence
(CC BY 4.0, https://creativecommons.org/licenses/by/4.0/). The individual recordings
keep the licences of their original sources, as listed in MUSAN's per-directory
`LICENSE` files (`noise/sound-bible/LICENSE`, `noise/free-sound/LICENSE`). The
details below are copied from those files.

The files were taken from the Hugging Face mirrors `FluidInference/musan` and
`bilguun/musan-noise`, which are byte-identical to each other on the files we checked.
They were renamed and stored as 16 kHz, 16-bit mono PCM WAV (MUSAN's native format).
The only edit is that `low-rumble.wav` is trimmed to its first 20 seconds.

| File | MUSAN id | Original title | Author | Licence | Source | Changes |
|---|---|---|---|---|---|---|
| `wind.wav` | noise-sound-bible-0084 | Wind | Stilgar | Public Domain | http://soundbible.com/1247-Wind.html | renamed |
| `low-rumble.wav` | noise-free-sound-0030 | (untitled in MUSAN, listed as a background noise) | Freesound user, not named in MUSAN | Public Domain ("All selected recordings were marked as in the Public Domain on Free Sound") | https://freesound.org/ via MUSAN | renamed, trimmed to 0 to 20 s |
| `hum.wav` | noise-sound-bible-0005 | Background Noise | Mike Koenig | CC BY 3.0 | http://soundbible.com/531-Background-Noise.html | renamed |
| `rain.wav` | noise-sound-bible-0062 | Rain | Mike Koenig | CC BY 3.0 | http://soundbible.com/1158-Rain.html | renamed |
| `truck-idle-pull-off.wav` | noise-sound-bible-0081 | Truck Idle And Pull Off | Mike Koenig | CC BY 3.0 | http://soundbible.com/1116-Truck-Idle-And-Pull-Off.html | renamed |
| `city-sirens.wav` | noise-sound-bible-0015 | City Ambiance | lezer | Public Domain | http://soundbible.com/1266-City-Ambiance.html | renamed |
| `football-crowd.wav` | noise-sound-bible-0031 | Football Crowd | GoGo | CC BY 3.0 | http://soundbible.com/1882-Football-Crowd.html | renamed |

CC BY 3.0: https://creativecommons.org/licenses/by/3.0/

### Short credit line (for the app's Credits panel)

> Noise samples from the MUSAN corpus (Snyder, Chen, Povey, 2015, CC BY 4.0), originally
> from SoundBible.com and Freesound.org: "Wind" by Stilgar (public domain), "Background
> Noise", "Rain" and "Truck Idle And Pull Off" by Mike Koenig (CC BY 3.0), "City Ambiance"
> by lezer (public domain), "Football Crowd" by GoGo (CC BY 3.0), and a public-domain
> Freesound background recording. Renamed; one clip trimmed.

## Why these clips

| File | Character | Role in tests and demos |
|---|---|---|
| `wind.wav`, `low-rumble.wav` | Stationary, energy below about 1.5 kHz | Stand-ins for car-interior noise |
| `hum.wav` | Stationary, harmonic hum plus broadband floor | Easy case for quantile estimation |
| `rain.wav` | Stationary, broadband | Easy case, tests the spectral floor |
| `truck-idle-pull-off.wav` | Engine, level and spectrum change around 8 s | Tests how fast the estimate tracks a change |
| `city-sirens.wav` | Non-stationary, sweeping tones | Hard case: tonal noise moving across bins |
| `football-crowd.wav` | Babble-like chants and whistles | Hardest case: speech-like noise |

## Integrity (SHA-256)

```
cced9c3719c7b1bb0c48541b2183ff6bf3b21222505110adaf133a5acf43e1b6  wind.wav
451cc4d3358b3192d668ba08d9858150da4e26112009969cde5ae90e31470745  low-rumble.wav
6c5fc8f5ce22a37e68d98f31588ab2430411249fda1bbfbd7de3634a98d6e572  hum.wav
844a80aa903f94094daec9e22b73db3e625613a6722384af4d3dc45509732dfd  rain.wav
9783c7faeb0fb9350e9e2f0336fd74507776a9e379dad2dc619d6d20bf86db12  truck-idle-pull-off.wav
0498a7a9aee716acab41a08663306978c09a0101ae76bcdd188b5f5381d1b24b  city-sirens.wav
78511b621632bb59d1979285f291adbffeef962307837c73a3f2b77264f27972  football-crowd.wav
```

## 2001 recordings (`2001/`)

Recordings made in 2001 for the original real-time demo and the Eurospeech 2001 /
DSP 2002 noise-estimation work. Licensed under the Creative Commons Attribution 4.0
International licence (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/).

**Credit:** Benoît Fauve and the Speech and Image Group (SIG), University of Wales Swansea, 2001.
`throwitaway.noisy.wav` is Benoît Fauve's own voice.

All files: 8 kHz, 16-bit mono PCM WAV, unchanged from 2001.

| File | Content | Duration |
|---|---|---|
| `throwitaway.noisy.wav` | Speech, "throw it away", in car noise | 2.8 s |
| `0mph.wav`, `20mph.wav`, `30mph.wav`, `50mph.wav`, `70mph.wav` | Car-interior noise at 0, 20, 30, 50 and 70 mph (0, 50 and 70 mph are the conditions of the Eurospeech 2001 paper) | 15 s each |
| `70.wav` | Car noise at 70 mph, excerpt | 8.2 s |
| `carnoise-filtered.wav` | Car noise, filtered | 7.2 s |
| `A440.wav` | 440 Hz test tone | 10 s |
| `whitenoise.wav` | White noise test signal | 10.5 s |

### Short credit line (for the app's Credits panel)

> 2001 recordings (speech, car noise at 0 to 70 mph, test signals) by Benoît Fauve and the
> Speech and Image Group (SIG), University of Wales Swansea, CC BY 4.0.

### Integrity (SHA-256)

```
aec7d94f1ee9a0453e1e9214a7d5f278d26b57c5e594b2472c7393757cb41589  throwitaway.noisy.wav
eb44218a56da1e3f9d16e0b7f228f303d8d2209b3b17d9299705331802b55d37  0mph.wav
14a6afbd48795991afce247c3e92d1df94ddf63e063bcc5c6d10ff08ce05886b  20mph.wav
3275b7bf9a31aea0b009a23fd7846cc34d7d98e3dca152b4d6160a1af9b4037a  30mph.wav
e40f4df7d297fde2a7e228522df4ecc7a37ad221e70b6679c6ca5f03b233825b  50mph.wav
8ba27d28070b0e22841393562a979b90a9bef9aabbbfd411d435db588d92ab78  70mph.wav
7bfca6e8fdb5a56cbfbb54d68921f1f52158a8db2ae80f64e63bce5a4df96da9  70.wav
16a8bb28963bdc0d81798b2c43e99672b17482aaa58c6349829cc6be60c75751  carnoise-filtered.wav
5958128f60ea6cf1158bc586c393a00dbcc3197dbcc0bc4ec296ea21b2968735  A440.wav
c7d7bc0a49a374c179af2b24791c65621b487981adb588297102ffa85067f348  whitenoise.wav
```

## Other folders

- `synthetic/` (not committed): generated by this project's own code, by the web build or by
  `ncspec gen-synthetic`.
  Dedicated to the public domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/).
- `private/` (never committed): the 2001 filter coefficient bank, used only by a local
  test. See `docs/03-test-audio.md`.
