class MeetLiveProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Int16Array(1600);
    this.offset = 0;
    this.position = 0;
    this.port.onmessage = (event) => {
      if (event.data !== 'flush') return;
      if (this.offset) {
        const tail = this.samples.slice(0, this.offset);
        this.port.postMessage(tail.buffer, [tail.buffer]);
        this.offset = 0;
      }
      this.port.postMessage('flushed');
    };
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const step = sampleRate / 16000;
    while (this.position < channel.length) {
      const value = Math.max(
        -1,
        Math.min(1, channel[Math.floor(this.position)] || 0)
      );
      this.samples[this.offset++] = value < 0 ? value * 32768 : value * 32767;
      this.position += step;
      if (this.offset === this.samples.length) {
        this.port.postMessage(this.samples.buffer, [this.samples.buffer]);
        this.samples = new Int16Array(1600);
        this.offset = 0;
      }
    }
    this.position -= channel.length;
    return true;
  }
}
registerProcessor('meet-live-pcm', MeetLiveProcessor);
