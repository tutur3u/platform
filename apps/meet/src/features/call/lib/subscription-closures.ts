/** Invalidates asynchronous SFU results when their publisher closes a track. */
export class SubscriptionClosures {
  private versions = new Map<string, number>();

  close(keys: Iterable<string>) {
    for (const key of keys)
      this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
  }

  capture(keys: string[]) {
    const captured = new Map(
      keys.map((key) => [key, this.versions.get(key) ?? 0])
    );
    return (key: string) =>
      captured.has(key) && captured.get(key) === (this.versions.get(key) ?? 0);
  }
}
