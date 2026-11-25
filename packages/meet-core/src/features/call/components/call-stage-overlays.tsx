'use client';

import {
  offersJoinQrOptions,
  type StageJoinQrState,
} from '../hooks/use-stage-join-qr';
import type { MeetRoomController } from '../lib/room-controller';
import { ReactionOverlay } from './reaction-overlay';
import { ScreenAudioStatus } from './screen-audio-status';
import { StageJoinQr } from './stage-join-qr';

/** Top-left status for this person's screen share audio, over the stage. */
export function StageScreenAudio({ stream }: { stream: MediaStream | null }) {
  if (!stream) return null;
  return (
    <div className="absolute top-3 left-3 z-20">
      <ScreenAudioStatus key={stream.id} stream={stream} />
    </div>
  );
}

/**
 * The overlays painted after the stage: floating reactions and the join QR.
 * Hosts and co-hosts get the QR's room options once the room keeps them.
 */
export function CallStageOverlays({
  meetingId,
  room,
  qr,
}: {
  meetingId: string;
  room: MeetRoomController;
  qr: StageJoinQrState;
}) {
  const { state } = room;
  return (
    <>
      <ReactionOverlay state={state} />
      <StageJoinQr
        meetingId={meetingId}
        qr={qr}
        settings={state.settings}
        onSettings={
          offersJoinQrOptions(state) ? room.updateSettings : undefined
        }
      />
    </>
  );
}
