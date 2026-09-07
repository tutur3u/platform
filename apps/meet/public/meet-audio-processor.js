// The browser requests a 16 kHz context; the controller verifies it before use.
class MeetAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(16000 * 10);
    this.offset = 0;
    this.port.onmessage = ({ data }) => {
      if (data === 'flush') {
        this.flush();
        this.port.postMessage({ flushed: true });
      }
    };
  }
  flush() {
    if (this.offset) {
      const samples = this.samples.slice(0, this.offset);
      this.port.postMessage({ samples }, [samples.buffer]);
      this.offset = 0;
    }
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const length = input?.length ?? outputs[0]?.[0]?.length ?? 128;
    for (let index = 0; index < length; index++) {
      this.samples[this.offset++] = input?.[index] ?? 0;
      if (this.offset === this.samples.length) this.flush();
    }
    return true;
  }
}
registerProcessor('meet-audio', MeetAudioProcessor);
