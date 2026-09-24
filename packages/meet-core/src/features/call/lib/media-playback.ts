/** Recover remote playback when the browser requires a user gesture. */
export function attachMediaPlayback(
  element: HTMLMediaElement,
  stream: MediaStream | null,
  onBlocked: (blocked: boolean) => void
) {
  let active = true;
  onBlocked(false);
  if (element.srcObject !== stream) element.srcObject = stream;
  const play = () => {
    if (!active || !stream) return;
    void element.play().then(
      () => {
        if (active) onBlocked(false);
      },
      (error: unknown) => {
        if (
          active &&
          error instanceof Error &&
          error.name === 'NotAllowedError'
        )
          onBlocked(true);
      }
    );
  };
  const document = element.ownerDocument;
  document.addEventListener('pointerdown', play);
  document.addEventListener('keydown', play);
  element.addEventListener('loadedmetadata', play);
  element.addEventListener('canplay', play);
  play();
  return () => {
    active = false;
    element.removeEventListener('loadedmetadata', play);
    element.removeEventListener('canplay', play);
    document.removeEventListener('pointerdown', play);
    document.removeEventListener('keydown', play);
  };
}
