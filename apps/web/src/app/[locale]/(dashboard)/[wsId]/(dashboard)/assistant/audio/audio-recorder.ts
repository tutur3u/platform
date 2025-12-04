import EventEmitter from 'eventemitter3';
import { createWorketFromSrc } from './audioworklet-registry';
import AudioRecordingWorklet from './worklets/audio-processing';
import VolMeterWorket from './worklets/vol-meter';

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    if (bytes?.[i] !== undefined) binary += String.fromCharCode(bytes[i]!);
  }
  return window.btoa(binary);
}

export class AudioRecorder extends EventEmitter {
  stream: MediaStream | undefined;
  audioContext: AudioContext | undefined;
  source: MediaStreamAudioSourceNode | undefined;
  recording: boolean = false;
  recordingWorklet: AudioWorkletNode | undefined;
  vuWorklet: AudioWorkletNode | undefined;

  private starting: Promise<void> | null = null;

  constructor(public sampleRate = 16000) {
    super();
  }

  async start() {
    // Prevent concurrent start calls
    if (this.starting) {
      await this.starting;
      return;
    }

    if (this.recording) {
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Could not request user media');
    }

    this.starting = (async () => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        // Create a fresh AudioContext for each recording session
        this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
        this.source = this.audioContext.createMediaStreamSource(this.stream);

        const workletName = 'audio-recorder-worklet';
        const src = createWorketFromSrc(workletName, AudioRecordingWorklet);

        try {
          await this.audioContext.audioWorklet.addModule(src);
        } catch (moduleError) {
          console.error('Failed to load audio worklet module:', moduleError);
          throw new Error(
            `Failed to load audio worklet: ${moduleError instanceof Error ? moduleError.message : 'Unknown error'}`
          );
        }

        this.recordingWorklet = new AudioWorkletNode(
          this.audioContext,
          workletName
        );

        this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
          // worklet processes recording floats and messages converted buffer
          const arrayBuffer = ev.data.data.int16arrayBuffer;

          if (arrayBuffer) {
            const arrayBufferString = arrayBufferToBase64(arrayBuffer);
            this.emit('data', arrayBufferString);
          }
        };
        this.source.connect(this.recordingWorklet);

        // vu meter worklet
        const vuWorkletName = 'vu-meter';
        try {
          await this.audioContext.audioWorklet.addModule(
            createWorketFromSrc(vuWorkletName, VolMeterWorket)
          );
        } catch (moduleError) {
          console.error('Failed to load VU meter worklet module:', moduleError);
          throw new Error(
            `Failed to load VU meter worklet: ${moduleError instanceof Error ? moduleError.message : 'Unknown error'}`
          );
        }

        this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName);
        this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
          this.emit('volume', ev.data.volume);
        };

        this.source.connect(this.vuWorklet);
        this.recording = true;
      } finally {
        this.starting = null;
      }
    })();

    await this.starting;
  }

  stop() {
    // its plausible that stop would be called before start completes
    // such as if the websocket immediately hangs up
    const handleStop = () => {
      this.recording = false;
      this.source?.disconnect();
      this.stream?.getTracks().forEach((track) => {
        track.stop();
      });

      // Disconnect worklets before closing context
      if (this.recordingWorklet) {
        this.recordingWorklet.disconnect();
        this.recordingWorklet = undefined;
      }
      if (this.vuWorklet) {
        this.vuWorklet.disconnect();
        this.vuWorklet = undefined;
      }

      // Close the AudioContext to free resources
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(() => {
          // Ignore close errors
        });
      }

      this.stream = undefined;
      this.source = undefined;
      this.audioContext = undefined;
    };

    if (this.starting) {
      this.starting.then(handleStop);
      return;
    }
    handleStop();
  }
}
