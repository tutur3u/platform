/** Cloudflare rejects subsequent session operations until ICE/DTLS connects. */
export function waitForPeerConnection(
  pc: RTCPeerConnection,
  timeoutMs = 12_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      pc.removeEventListener('connectionstatechange', check);
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      if (pc.connectionState === 'connected') finish();
      else if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed'
      )
        finish(new Error('sfu_connection_failed'));
    };
    const timer = setTimeout(
      () => finish(new Error('sfu_connection_timeout')),
      timeoutMs
    );
    pc.addEventListener('connectionstatechange', check);
    check();
  });
}
