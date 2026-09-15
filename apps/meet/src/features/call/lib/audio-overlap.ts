/** Short-lived local features only; no audio recordings or network payloads. */
export interface AudioFingerprint {
  level: number;
  spectrum: number[];
}

export const OVERLAP_HISTORY = 64;
const WINDOW = 32;
const MAX_DELAY = 12;
const SPEECH_LEVEL = Math.log(0.008);

/** Gain-independent correlation; constant signals provide no evidence. */
function correlation(a: number[], b: number[]) {
  const meanA = a.reduce((sum, x) => sum + x, 0) / a.length;
  const meanB = b.reduce((sum, x) => sum + x, 0) / b.length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]! - meanA;
    const y = b[i]! - meanB;
    covariance += x * y;
    varianceA += x * x;
    varianceB += y * y;
  }
  return varianceA > 0.001 && varianceB > 0.001
    ? covariance / Math.sqrt(varianceA * varianceB)
    : 0;
}

/** Require matching speech dynamics and changing spectra over repeated windows. */
export function audioOverlapScore(
  local: AudioFingerprint[],
  remote: AudioFingerprint[]
) {
  let strongest = 0;
  for (let delay = -MAX_DELAY; delay <= MAX_DELAY; delay++) {
    const localEnd = local.length - Math.max(delay, 0);
    const remoteEnd = remote.length - Math.max(-delay, 0);
    if (localEnd < WINDOW || remoteEnd < WINDOW) continue;
    const a = local.slice(localEnd - WINDOW, localEnd);
    const b = remote.slice(remoteEnd - WINDOW, remoteEnd);
    const dynamics = correlation(
      a.map((x) => x.level),
      b.map((x) => x.level)
    );
    if (dynamics < 0.93) continue;
    const voiced = a.flatMap((x, i) =>
      x.level >= SPEECH_LEVEL && b[i]!.level >= SPEECH_LEVEL ? [i] : []
    );
    if (voiced.length < 20) continue;
    let similarity = 0;
    let changingBands = 0;
    let bandCorrelation = 0;
    for (const i of voiced)
      similarity += a[i]!.spectrum.reduce(
        (sum, value, band) => sum + value * (b[i]!.spectrum[band] ?? 0),
        0
      );
    if (similarity / voiced.length < 0.94) continue;
    for (let band = 0; band < (a[0]?.spectrum.length ?? 0); band++) {
      const valuesA = voiced.map((i) => a[i]!.spectrum[band] ?? 0);
      const valuesB = voiced.map((i) => b[i]!.spectrum[band] ?? 0);
      const value = correlation(valuesA, valuesB);
      if (value !== 0) {
        changingBands++;
        bandCorrelation += value;
      }
    }
    // Silence, steady tones and flat noise cannot identify a shared voice.
    if (changingBands < 4 || bandCorrelation / changingBands < 0.8) continue;
    strongest = Math.max(strongest, dynamics);
  }
  return strongest;
}

/** Three consecutive observations prevent a single matching syllable muting a mic. */
export class AudioOverlapEvidence {
  private hits = new Map<string, { count: number; at: number }>();
  observe(peerId: string, score: number, now: number) {
    const previous = this.hits.get(peerId);
    if (score < 0.93 || !Number.isFinite(score)) {
      this.hits.delete(peerId);
      return false;
    }
    if (previous && now - previous.at < 350) return false;
    const count = previous && now - previous.at <= 800 ? previous.count + 1 : 1;
    this.hits.set(peerId, { count, at: now });
    return count >= 3;
  }
  clear() {
    this.hits.clear();
  }
}
