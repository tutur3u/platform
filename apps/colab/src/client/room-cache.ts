import { replaceEqualDeep } from '@tanstack/react-query';
import type { RoomView } from '@tuturuuu/multiplayer';

/** A delayed HTTP response must never undo a newer socket visibility update. */
export function newestRoomView(previous: unknown, incoming: unknown) {
  const current = previous as RoomView | undefined;
  const next = incoming as RoomView;
  if (
    current?.id === next.id &&
    current?.self.id === next.self.id &&
    current.revision > next.revision
  )
    return current;
  return replaceEqualDeep(previous, incoming);
}
