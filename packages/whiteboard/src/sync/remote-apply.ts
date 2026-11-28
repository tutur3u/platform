import type { ExcalidrawElement } from '../types';
import { mergeElements } from './elements';

/**
 * Applies a remote batch to the local scene through `update` (Excalidraw's
 * `updateScene`) and returns the baseline the next local change is diffed
 * against.
 *
 * The baseline is copied after `update` returns: Excalidraw repairs invalid
 * fractional indices of the elements it is handed in place and bumps their
 * versions. Those repairs are part of applying the remote batch, not local
 * edits, so they must never be broadcast; otherwise peers that order the
 * scene differently re-index and re-send the same elements to each other
 * without end.
 */
export function applyRemoteElements(
  local: readonly ExcalidrawElement[],
  remote: readonly ExcalidrawElement[],
  update: (elements: ExcalidrawElement[]) => void
): ExcalidrawElement[] {
  const merged = mergeElements(local, remote);
  update(merged);
  return merged.map((element) => ({ ...element }));
}
