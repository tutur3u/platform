/** Listen inside same-origin, script-disabled email frames without relaxing their sandbox. */
export function subscribeMailKeyboard(
  root: HTMLElement | null,
  onKeyDown: (event: KeyboardEvent) => void
) {
  const frames = new Map<
    HTMLIFrameElement,
    { document: Document | null; load: () => void }
  >();
  const scan = () => {
    for (const [frame, entry] of frames) {
      if (root?.contains(frame)) continue;
      frame.removeEventListener('load', entry.load);
      entry.document?.removeEventListener('keydown', onKeyDown);
      frames.delete(frame);
    }
    for (const frame of root?.querySelectorAll('iframe') ?? []) {
      if (frames.has(frame)) continue;
      const entry = { document: null as Document | null, load: () => {} };
      entry.load = () => {
        entry.document?.removeEventListener('keydown', onKeyDown);
        try {
          entry.document = frame.contentDocument;
        } catch {
          entry.document = null;
        }
        entry.document?.addEventListener('keydown', onKeyDown);
      };
      frames.set(frame, entry);
      frame.addEventListener('load', entry.load);
      entry.load();
    }
  };
  window.addEventListener('keydown', onKeyDown);
  scan();
  const observer = new MutationObserver(scan);
  if (root) observer.observe(root, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    for (const [frame, entry] of frames) {
      frame.removeEventListener('load', entry.load);
      entry.document?.removeEventListener('keydown', onKeyDown);
    }
  };
}
