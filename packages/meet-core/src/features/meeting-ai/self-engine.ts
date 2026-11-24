import { meetBrowserPath } from '@tuturuuu/utils/meet-url';
import { SELF_SAMPLE_RATE } from './self-chunker';

export type SelfEngine = {
  /** Point the tap at a replacement microphone track without a gap. */
  swapTrack: (track: MediaStreamTrack) => void;
  /** Disconnects only the transcription branch; the call track is untouched. */
  dispose: () => void;
};
export type SelfEngineFactory = (
  track: MediaStreamTrack,
  onFrame: (frame: Float32Array) => void
) => Promise<SelfEngine>;

/** 16 kHz mono tap on one microphone track, delivered as 20 ms frames. */
export const createSelfEngine: SelfEngineFactory = async (track, onFrame) => {
  const context = new AudioContext({ sampleRate: SELF_SAMPLE_RATE });
  try {
    if (context.sampleRate !== SELF_SAMPLE_RATE)
      throw new Error('Unsupported audio sample rate');
    await context.audioWorklet.addModule(
      meetBrowserPath('/meet-self-audio-processor.js')
    );
    const node = new AudioWorkletNode(context, 'meet-self-audio', {
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    const silent = context.createGain();
    silent.gain.value = 0;
    node.connect(silent);
    silent.connect(context.destination);
    node.port.onmessage = ({ data }: MessageEvent<Float32Array>) =>
      onFrame(data);
    let source = context.createMediaStreamSource(new MediaStream([track]));
    source.connect(node);
    await context.resume();
    return {
      swapTrack(next) {
        source.disconnect();
        source = context.createMediaStreamSource(new MediaStream([next]));
        source.connect(node);
      },
      dispose() {
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        silent.disconnect();
        if (context.state !== 'closed') void context.close();
      },
    };
  } catch (error) {
    if (context.state !== 'closed') void context.close();
    throw error;
  }
};
