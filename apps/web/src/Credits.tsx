/** Attribution shown in both UIs. Keep in sync with testdata/ATTRIBUTION.md and NOTICE.md. */
export function Credits() {
  return (
    <div class="credits">
      <h3>Research</h3>
      <p>
        Speech and Image Group (SIG), University of Wales Swansea, 2001: John Mason (group lead), Nicholas Evans (PhD
        candidate) and Benoît Fauve (Erasmus student from ENSPM, now Centrale Marseille).
      </p>
      <p>
        N. W. D. Evans, J. S. Mason,{" "}
        <i>
          Noise estimation without explicit speech, non-speech detection: a comparison of mean, modal and median based
          approaches
        </i>
        , Eurospeech 2001. N. W. D. Evans, J. S. Mason, B. Fauve,{" "}
        <i>
          Efficient real-time noise estimation without explicit speech, non-speech detection: an assessment on the
          AURORA corpus
        </i>
        , DSP 2002.
      </p>
      <h3>Speech sample</h3>
      <p>
        Clean speech from LibriSpeech (V. Panayotov, G. Chen, D. Povey, S. Khudanpur, 2015,{" "}
        <a href="https://www.openslr.org/12" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
        ), utterance 1462-170138-0024 (Willa Cather, Alexander's Bridge). Modified: telephone band, gain, leading
        silence.
      </p>
      <h3>Noise samples</h3>
      <p>
        From the MUSAN corpus (D. Snyder, G. Chen, D. Povey, 2015,{" "}
        <a href="https://www.openslr.org/17/" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
        ), originally from SoundBible.com and Freesound.org: "Wind" by Stilgar (public domain), "Background Noise",
        "Rain" and "Truck Idle And Pull Off" by Mike Koenig (CC BY 3.0), "City Ambiance" by lezer (public domain),
        "Football Crowd" by GoGo (CC BY 3.0), and a public-domain Freesound background recording. Renamed; one clip
        trimmed. Synthetic signals: CC0.
      </p>
      <h3>2001 material</h3>
      <p>
        2001 recordings (speech, car noise at 0 to 70 mph, test signals) by Benoît Fauve and the Speech and Image Group
        (SIG), University of Wales Swansea,{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
        . The 2001 view re-creates the original MFC (Visual C++) application, which was built on Paul Cheffers' MFC
        sound-recording sample (CodeGuru). The University of Wales Swansea crest and the SIG logo appear in the 2001
        view as a historical re-creation; they remain the property of their owners and are not covered by this project's
        licence.
      </p>
      <h3>Licence</h3>
      <p>Code: MIT. Audio: see above.</p>
    </div>
  );
}
