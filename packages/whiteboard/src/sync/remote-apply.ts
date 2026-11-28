import type { ExcalidrawElement } from '../types';
import { mergeElements } from './elements';

/**
 * Applies a remote batch to the local scene through `update` (Excalidraw's
 * `updateScene`) and returns the baseline the next local change is diffed
 * against.
 *
 * The baseline is read back through `read` (the scene including deleted
 * elements) after `update` returns: Excalidraw repairs invalid fractional
 * indices of the elements it is handed and bumps their versions, either in
 * place or on copies it stores in the scene. Those repairs are part of
 * applying the remote batch, not local edits, so they must never be
 * broadcast; otherwise peers that order the scene differently re-index and
 * re-send the same elements to each other without end. Reading the scene
 * back, rather than the array handed to `update`, covers both behaviours.
 */
export function applyRemoteElements(
  local: readonly ExcalidrawElement[],
  remote: readonly ExcalidrawElement[],
  update: (elements: ExcalidrawElement[]) => void,
  read: () => readonly ExcalidrawElement[]
): ExcalidrawElement[] {
  update(mergeElements(local, remote));
  return read().map((element) => ({ ...element }));
}
