/** Shutdown waits for already approved actions to settle before privacy changes proceed. */
export class LiveActions {
  private controller = new AbortController();
  private pending = new Set<Promise<void>>();
  get signal() {
    return this.controller.signal;
  }
  run(action: () => Promise<void>) {
    this.signal.throwIfAborted();
    const pending = action().finally(() => this.pending.delete(pending));
    this.pending.add(pending);
    return pending;
  }
  async cancel() {
    this.controller.abort();
    await Promise.allSettled(this.pending);
  }
}
