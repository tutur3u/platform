import type { UpskiiPresentation } from '@tuturuuu/realtime/meet/room-upskii-presentation';
import type { UpskiiRoomSnapshot } from './upskii-store';

/**
 * What the Upskii panel shows; exactly one applies. Only a presenter ever
 * reaches the picker, so only a presenter's session reads Upskii.
 */
export type UpskiiPanelView =
  | { kind: 'connecting' }
  | {
      kind: 'presenting';
      presentation: UpskiiPresentation;
      canPresent: boolean;
    }
  | { kind: 'picking'; current: UpskiiPresentation | null }
  | { kind: 'waiting' };

export function upskiiPanelView(
  room: Pick<UpskiiRoomSnapshot, 'connected' | 'presentation' | 'canPresent'>,
  choosing: boolean
): UpskiiPanelView {
  if (!room.connected) return { kind: 'connecting' };
  if (room.canPresent && (choosing || !room.presentation))
    return { kind: 'picking', current: room.presentation };
  if (room.presentation)
    return {
      kind: 'presenting',
      presentation: room.presentation,
      canPresent: room.canPresent,
    };
  return { kind: 'waiting' };
}

/** The message key for a refused present or stop. */
export function upskiiRequestErrorKey(error: string) {
  switch (error) {
    case 'upskii_url_rejected':
      return 'url_rejected';
    case 'permission_denied':
      return 'permission_denied';
    case 'disconnected':
      return 'disconnected';
    default:
      return 'request_failed';
  }
}
