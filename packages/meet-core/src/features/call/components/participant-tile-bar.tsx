'use client';

import { MicOff, MonitorUp } from '@tuturuuu/icons';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { MediaReceivingStatus } from './media-receiving-status';
import { MiraAudioStatus } from './mira-audio-status';
import { ParticipantIdentityBadge } from './participant-identity-badge';

/** Bottom overlay bar of a participant tile: name, identity, media state, and host mute button. */
export function ParticipantTileBar({
  participant,
  displayName,
  kind,
  floating,
  condensed,
  isSelf,
  presenceOnly,
  showVideo,
  controlsHidden,
  miraActive,
  receivingAudio,
  receivingVideo,
  onMute,
}: {
  participant: MeetRealtimePresence;
  displayName: string;
  kind: 'camera' | 'screen';
  floating: boolean;
  condensed: boolean;
  isSelf?: boolean;
  presenceOnly: boolean;
  showVideo: boolean;
  controlsHidden: boolean;
  miraActive: boolean;
  receivingAudio: boolean;
  receivingVideo: boolean;
  onMute?: (userId: string) => void;
}) {
  const t = useTranslations('meet.call');
  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t to-transparent px-3 py-2 motion-safe:transition-opacity',
        controlsHidden && 'pointer-events-none opacity-0',
        showVideo
          ? 'from-media-scrim text-media-scrim-foreground'
          : 'from-background/90 text-foreground'
      )}
    >
      {kind === 'screen' && (
        <MonitorUp
          aria-label={t('sharing_screen')}
          className="size-4 shrink-0"
        />
      )}
      {/* One line with an ellipsis, so the name never rises into the avatar. */}
      <span
        className={cn(
          'min-w-0 font-medium leading-tight',
          floating ? 'truncate text-xs' : 'truncate text-sm'
        )}
        title={floating ? undefined : displayName}
      >
        {floating || (condensed && isSelf) ? t('you') : displayName}
      </span>
      {!floating && !(condensed && isSelf) && (
        <ParticipantIdentityBadge
          className="backdrop-blur-sm"
          participant={participant}
        />
      )}
      {isSelf && !floating && !condensed && (
        <span className="shrink-0 font-medium text-sm leading-tight">
          · {t('you')}
        </span>
      )}
      {!isSelf && !presenceOnly && (
        <MediaReceivingStatus
          audio={receivingAudio}
          video={receivingVideo}
          expectAudio={kind === 'camera' && participant.media.audioEnabled}
          expectVideo={
            kind === 'camera'
              ? participant.media.videoEnabled
              : participant.media.screenEnabled
          }
        />
      )}
      {miraActive && kind === 'camera' && !presenceOnly && (
        <MiraAudioStatus participant={participant} />
      )}
      {!presenceOnly &&
        !participant.media.audioEnabled &&
        kind === 'camera' && (
          <MicOff aria-label={t('muted')} className="size-3.5 shrink-0" />
        )}
      {onMute &&
        !isSelf &&
        kind === 'camera' &&
        participant.media.audioEnabled && (
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              'ml-auto size-8 shrink-0 rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100',
              showVideo
                ? 'bg-background/30 text-media-scrim-foreground hover:bg-background/60'
                : 'bg-foreground/10 text-foreground hover:bg-foreground/20'
            )}
            aria-label={t('mute_participant', {
              name: displayName,
            })}
            onClick={() => onMute(participant.userId)}
          >
            <MicOff className="size-4" />
          </Button>
        )}
    </div>
  );
}
