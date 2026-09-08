export const PEER_CONFIG: RTCConfiguration = {
  bundlePolicy: 'max-bundle',
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
};

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

/** A failed session cannot be reused by the next media operation. */
export async function preparePeerSession(
  pc: RTCPeerConnection,
  isCurrent: () => boolean,
  reset: () => void
) {
  if (!pc.remoteDescription) return;
  try {
    await waitForPeerConnection(pc);
  } catch (error) {
    if (isCurrent()) reset();
    throw error;
  }
}

/** Apply the session's short-lived relay credentials before any offer is created. */
export function configurePeerIce(
  pc: RTCPeerConnection,
  iceServers?: RTCIceServer[]
) {
  pc.setConfiguration({
    ...pc.getConfiguration(),
    iceServers: iceServers ?? PEER_CONFIG.iceServers,
  });
}
