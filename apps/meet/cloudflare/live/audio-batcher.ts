/** Batch PCM transport at 200 ms and discard stale speech instead of replaying a backlog. */
export class LiveAudioBatcher {
  private chunks: Uint8Array[] = [];
  private bytes = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private chain = Promise.resolve();
  private sequence = 0;
  private generation = 0;
  constructor(
    private readonly deliver: (
      data: string,
      sequence: number,
      at: number
    ) => Promise<unknown>,
    private readonly failed: () => void,
    initialSequence = Date.now() * 1000
  ) {
    this.sequence = initialSequence;
  }
  push(encoded: string) {
    const chunk = Uint8Array.from(atob(encoded), (value) =>
      value.charCodeAt(0)
    );
    if (chunk.length % 2 || chunk.length > 96000) return;
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 200);
    if (this.bytes >= 24000) this.flush();
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.bytes) return;
    const bytes = new Uint8Array(this.bytes);
    let offset = 0;
    for (const chunk of this.chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    this.bytes = 0;
    const at = Date.now();
    const generation = this.generation;
    for (let start = 0; start < bytes.length; start += 24000) {
      let binary = '';
      for (const byte of bytes.subarray(start, start + 24000))
        binary += String.fromCharCode(byte);
      const data = btoa(binary),
        sequence = this.sequence++;
      this.chain = this.chain
        .then(async () => {
          if (generation === this.generation && Date.now() - at < 2000)
            await this.deliver(data, sequence, at);
        })
        .catch(() => this.failed());
    }
  }
  async drain() {
    this.flush();
    await this.chain;
  }
  clear() {
    this.generation++;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.chunks = [];
    this.bytes = 0;
  }
}
