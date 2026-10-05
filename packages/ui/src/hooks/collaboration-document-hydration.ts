interface DocumentHydrationOptions {
  load: () => Promise<number[] | null>;
  apply: (state: Uint8Array) => void;
  isActive: () => boolean;
  onLoaded: () => void;
  onError: () => void;
}

/** Coalesces durable reads and fences late completion after resource teardown. */
export class DocumentHydration {
  private pending: Promise<boolean> | undefined;

  constructor(private readonly options: DocumentHydrationOptions) {}

  load(): Promise<boolean> {
    if (this.pending) return this.pending;
    this.pending = this.read().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async read(): Promise<boolean> {
    try {
      const state = await this.options.load();
      if (!this.options.isActive()) return false;
      if (state?.length) this.options.apply(Uint8Array.from(state));
      this.options.onLoaded();
      return true;
    } catch {
      if (this.options.isActive()) this.options.onError();
      return false;
    }
  }
}
