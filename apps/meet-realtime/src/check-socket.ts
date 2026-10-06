/** Await a single connection attempt; never hide failed admission with retries. */
export function waitForCheckSocket(
  socket: Pick<
    WebSocket,
    'readyState' | 'addEventListener' | 'removeEventListener' | 'close'
  >,
  timeoutMs = 10_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      socket.removeEventListener('open', opened);
      socket.removeEventListener('error', failed);
      socket.removeEventListener('close', closed);
      if (error) {
        // A failed attempt must not keep the finite check process alive.
        try {
          socket.close();
        } catch {
          // Disposal must never replace the original connection failure.
        }
        reject(error);
      } else resolve();
    };
    const opened = () => finish();
    const failed = () => finish(new Error('Connection failed'));
    const closed = () => finish(new Error('Connection closed before opening'));
    socket.addEventListener('open', opened);
    if (settled) return;
    socket.addEventListener('error', failed);
    if (settled) return;
    socket.addEventListener('close', closed);
    if (settled) return;
    // Recheck after subscribing, including already-terminal connections.
    if (socket.readyState === 1) opened();
    else if (socket.readyState === 2 || socket.readyState === 3) closed();
    else
      timer = setTimeout(
        () => finish(new Error('Connection timed out')),
        timeoutMs
      );
  });
}
