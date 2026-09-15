import {
  type AudioFingerprint,
  AudioOverlapEvidence,
  audioOverlapScore,
  OVERLAP_HISTORY,
} from './audio-overlap';

const BANDS = [
  120, 180, 260, 360, 500, 700, 950, 1250, 1650, 2200, 3000, 4000, 5500,
];
export interface OverlapPeer {
  userId: string;
  track: MediaStreamTrack;
}
interface Source {
  track: MediaStreamTrack;
  node: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  waveform: Float32Array<ArrayBuffer>;
  frequencies: Float32Array<ArrayBuffer>;
  history: AudioFingerprint[];
}

/** Observe existing enabled microphones without capturing, cloning or playing audio. */
export class AudioOverlapMonitor {
  private context: AudioContext | null = null;
  private sources = new Map<string, Source>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private evidence = new AudioOverlapEvidence();
  private previousTime = 0;
  private lastComparison = 0;
  private reported = false;

  constructor(private onOverlap: (peer: OverlapPeer) => void) {}

  start() {
    if (this.context || typeof AudioContext === 'undefined') return;
    try {
      this.context = new AudioContext();
      this.resume();
      document.addEventListener('pointerdown', this.resume);
      document.addEventListener('keydown', this.resume);
      this.timer = setInterval(() => this.sample(), 50);
    } catch {
      this.stop();
    }
  }

  private resume = () => {
    if (this.context?.state === 'suspended')
      void this.context.resume().catch(() => undefined);
  };

  update(local: MediaStreamTrack | undefined, peers: OverlapPeer[]) {
    const context = this.context;
    if (!context) return;
    const requested = new Map<string, MediaStreamTrack>();
    if (local?.enabled && local.readyState === 'live')
      requested.set('local', local);
    for (const peer of peers.slice(0, 8))
      if (peer.track.readyState === 'live')
        requested.set(peer.userId, peer.track);
    let changed = false;
    for (const [id, source] of this.sources) {
      if (requested.get(id) === source.track) continue;
      source.node.disconnect();
      source.analyser.disconnect();
      this.sources.delete(id);
      changed = true;
    }
    for (const [id, track] of requested) {
      if (this.sources.has(id)) continue;
      try {
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0;
        const node = context.createMediaStreamSource(new MediaStream([track]));
        // AnalyserNode works without a destination; this graph emits no sound.
        node.connect(analyser);
        this.sources.set(id, {
          track,
          node,
          analyser,
          history: [],
          waveform: new Float32Array(analyser.fftSize),
          frequencies: new Float32Array(analyser.frequencyBinCount),
        });
        changed = true;
      } catch {
        // Unsupported/ended media must never block the call or mute the user.
      }
    }
    if (changed) this.clearHistory();
  }

  private clearHistory() {
    for (const source of this.sources.values()) source.history = [];
    this.evidence.clear();
    this.previousTime = 0;
    this.lastComparison = 0;
  }

  private sample() {
    const context = this.context;
    const local = this.sources.get('local');
    if (this.reported || context?.state !== 'running' || this.sources.size < 2)
      return;
    if (
      !local?.track.enabled ||
      local.track.muted ||
      local.track.readyState !== 'live'
    ) {
      this.clearHistory();
      return;
    }
    const now = context.currentTime * 1000;
    // Background throttling or a suspended audio context is not matching evidence.
    if (
      this.previousTime &&
      (now - this.previousTime > 150 || now <= this.previousTime)
    )
      this.clearHistory();
    this.previousTime = now;
    for (const source of this.sources.values()) {
      if (
        !source.track.enabled ||
        source.track.muted ||
        source.track.readyState !== 'live'
      ) {
        source.history = [];
        continue;
      }
      source.analyser.getFloatTimeDomainData(source.waveform);
      source.analyser.getFloatFrequencyData(source.frequencies);
      const rms = Math.sqrt(
        source.waveform.reduce((sum, x) => sum + x * x, 0) /
          source.waveform.length
      );
      const spectrum = BANDS.slice(1).map((upper, band) => {
        const from = Math.ceil(
          (BANDS[band]! * source.analyser.fftSize) / context.sampleRate
        );
        const to = Math.min(
          source.frequencies.length,
          Math.ceil((upper * source.analyser.fftSize) / context.sampleRate)
        );
        let energy = 0;
        for (let bin = from; bin < to; bin++)
          energy += 10 ** (source.frequencies[bin]! / 10);
        return Math.sqrt(energy);
      });
      const magnitude = Math.sqrt(spectrum.reduce((sum, x) => sum + x * x, 0));
      source.history.push({
        level: Math.log(Math.max(rms, 0.00001)),
        spectrum: spectrum.map((x) => (magnitude ? x / magnitude : 0)),
      });
      if (source.history.length > OVERLAP_HISTORY) source.history.shift();
    }
    if (now - this.lastComparison < 400) return;
    this.lastComparison = now;
    for (const [userId, remote] of this.sources) {
      if (userId === 'local' || remote.track.readyState !== 'live') continue;
      const score = audioOverlapScore(local.history, remote.history);
      if (!this.evidence.observe(userId, score, now)) continue;
      this.reported = true;
      this.onOverlap({ userId, track: remote.track });
      break;
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('pointerdown', this.resume);
    document.removeEventListener('keydown', this.resume);
    for (const source of this.sources.values()) {
      source.node.disconnect();
      source.analyser.disconnect();
    }
    this.sources.clear();
    this.clearHistory();
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
  }
}
