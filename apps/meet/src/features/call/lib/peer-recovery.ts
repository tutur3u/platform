/** Recover media independently of the signaling socket, which can stay healthy. */
export function watchPeerRecovery(
  pc: RTCPeerConnection,
  isCurrent: () => boolean,
  recover: () => void
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scheduledState: RTCPeerConnectionState | undefined;
  let recovered = false;
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
    scheduledState = undefined;
  };
  const check = () => {
    const state = pc.connectionState;
    if (state === 'closed') {
      clear();
      pc.removeEventListener('connectionstatechange', check);
      return;
    }
    if (state === 'connected' || !isCurrent()) {
      clear();
      return;
    }
    if (recovered || state === 'new' || scheduledState === state) return;
    clear();
    scheduledState = state;
    timer = setTimeout(
      () => {
        if (!isCurrent() || pc.connectionState !== state || recovered) return;
        recovered = true;
        pc.removeEventListener('connectionstatechange', check);
        recover();
      },
      state === 'failed' ? 1000 : state === 'disconnected' ? 10_000 : 20_000
    );
  };
  pc.addEventListener('connectionstatechange', check);
  check();
}
