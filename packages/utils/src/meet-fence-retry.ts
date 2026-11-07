/** Retry only an aborted lock acquisition; every attempt executes the fenced RPC. */
export async function retryMeetFenceRpc<
  T extends { error: { code?: string } | null },
>(
  operation: () => PromiseLike<T>,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))
): Promise<T> {
  let attempt = 0;
  for (;;) {
    const result = await operation();
    if (result.error?.code !== '55P03' || attempt === 3) return result;
    await wait(100 * 2 ** attempt);
    attempt++;
  }
}
