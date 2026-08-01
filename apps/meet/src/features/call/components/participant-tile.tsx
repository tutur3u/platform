'use client';

import { Hand, MicOff, MonitorUp, Pin } from '@tuturuuu/icons';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useRef } from 'react';

function initials(displayName: string) {
  return displayName
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function ParticipantTile({
  className,
  handRaised,
  isSelf,
  isSpeaking,
  participant,
  stream,
}: {
  className?: string;
  handRaised?: boolean;
  isSelf?: boolean;
  isSpeaking?: boolean;
  participant: MeetRealtimePresence;
  stream?: MediaStream | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const showVideo = Boolean(
    stream &&
      (participant.media.videoEnabled || participant.media.screenEnabled)
  );

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !stream) return;
    if (element.srcObject !== stream) element.srcObject = stream;
  }, [stream]);

  return (
    <div
      className={cn(
        'group relative isolate overflow-hidden rounded-xl bg-dynamic-surface ring-1 ring-border transition-[box-shadow,transform]',
        isSpeaking && 'ring-2 ring-dynamic-green',
        className
      )}
    >
      {showVideo ? (
        <video
          autoPlay
          className={cn(
            'size-full object-cover',
            // A self-view that is not mirrored feels broken to the user, but a
            // shared screen must never be flipped.
            isSelf && !participant.media.screenEnabled && '-scale-x-100'
          )}
          muted={isSelf}
          playsInline
          ref={videoRef}
        />
      ) : (
        <div className="grid size-full place-items-center">
          <div className="grid size-16 place-items-center rounded-full bg-foreground/10 font-medium text-lg">
            {initials(participant.displayName)}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
        <span className="truncate font-medium text-sm text-white">
          {participant.displayName}
        </span>
        {participant.media.audioEnabled ? null : (
          <MicOff
            aria-label="Muted"
            className="size-3.5 shrink-0 text-white/80"
          />
        )}
        {participant.media.screenEnabled ? (
          <MonitorUp
            aria-label="Sharing screen"
            className="size-3.5 shrink-0 text-dynamic-blue"
          />
        ) : null}
        {handRaised ? (
          <Hand
            aria-label="Hand raised"
            className="size-3.5 shrink-0 text-dynamic-orange"
          />
        ) : null}
      </div>

      {isSelf ? (
        <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/50 px-1.5 py-0.5 font-medium text-[0.65rem] text-white uppercase tracking-wide">
          <Pin className="mr-1 inline size-3" />
          You
        </span>
      ) : null}
    </div>
  );
}
