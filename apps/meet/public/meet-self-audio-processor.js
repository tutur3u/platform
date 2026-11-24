// Posts the microphone as consecutive 20 ms frames (320 samples at 16 kHz).
// Silent and muted input still produces frames, so the sample timeline never
// stalls.
const FRAME = 320;
class MeetSelfAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(FRAME);
    this.offset = 0;
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const length = input?.length ?? outputs[0]?.[0]?.length ?? 128;
    for (let index = 0; index < length; index++) {
      this.frame[this.offset++] = input?.[index] ?? 0;
      if (this.offset === FRAME) {
        const frame = this.frame;
        this.port.postMessage(frame, [frame.buffer]);
        this.frame = new Float32Array(FRAME);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('meet-self-audio', MeetSelfAudioProcessor);
