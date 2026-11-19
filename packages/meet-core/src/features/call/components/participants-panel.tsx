'use client';
import {
  Check,
  Hand,
  MicOff,
  UserMinus,
  UserRoundPlus,
  Users,
  X,
} from '@tuturuuu/icons';
import type {
  MeetApprovedParticipant,
  MeetRealtimePresence,
  MeetRealtimeWaitingParticipant,
  MeetRoomSettings,
} from '@tuturuuu/realtime/meet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { SettingsField } from '../../../../../ui/src/components/ui/custom/settings-field';
import { Switch } from '@tuturuuu/ui/switch';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { useLargeRoomLabels } from '../lib/large-room-labels';
import { MiraAudioStatus } from './mira-audio-status';
import { MiraAvatar } from './mira-profile';
import { RoomHostControls } from './room-host-controls';
export function ParticipantsPanel({
  approved,
  miraActive = false,
  onForget,
  shareNotes,
  onShareNotes,
  canManage,
  onAdmitAll,
  onDenyAll,
  onSettingsChange,
  onCamerasLockedChange,
  onMediaOverride,
  settings,
  isHost = canManage,
  bulkRemaining,
  onDecideAdmission,
  onMute,
  onRemove,
  participants,
  raisedHandUserIds,
  selfUserId,
  waiting,
}: {
  approved: MeetApprovedParticipant[];
  miraActive?: boolean;
  onForget: (userId: string) => void;
  shareNotes: boolean;
  onShareNotes: (enabled: boolean) => void;
  canManage: boolean;
  onAdmitAll?: () => void;
  onDenyAll?: () => void;
  onSettingsChange?: (settings: Partial<MeetRoomSettings>) => void;
  onCamerasLockedChange?: (locked: boolean) => void;
  onMediaOverride?: (
    id: string,
    override: NonNullable<MeetRoomSettings['mediaOverrides']>[string] | null
  ) => void;
  settings?: MeetRoomSettings;
  isHost?: boolean;
  bulkRemaining?: number;
  onDecideAdmission: (userId: string, admit: boolean) => void;
  onMute: (userId: string) => void;
  onRemove: (userId: string) => void;
  participants: MeetRealtimePresence[];
  raisedHandUserIds: string[];
  selfUserId: string | null;
  waiting: MeetRealtimeWaitingParticipant[];
}) {
  const t = useTranslations('meet.call');
  const labels = useLargeRoomLabels();
  const raised = new Set(raisedHandUserIds);
  const ordered = [...participants].sort(
    (a, b) => Number(raised.has(b.userId)) - Number(raised.has(a.userId))
  );

  return (
    <ScrollArea className="min-h-0 flex-1">
      {canManage && (onSettingsChange || onCamerasLockedChange) && (
        <RoomPermissionToggles
          settings={settings}
          isHost={isHost}
          onSettingsChange={onSettingsChange}
          onCamerasLockedChange={onCamerasLockedChange}
        />
      )}
      {canManage && waiting.length ? (
        <Accordion
          type="multiple"
          defaultValue={['requests']}
          className="border-b px-3"
        >
          <AccordionItem value="requests" className="border-0">
            <AccordionTrigger className="gap-2 text-sm">
              <UserRoundPlus className="size-4 shrink-0" />
              <span className="flex-1 text-left">{t('requests')}</span>
              <Badge variant="secondary">{waiting.length}</Badge>
            </AccordionTrigger>
            <AccordionContent>
              {(onAdmitAll || onDenyAll) && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {onAdmitAll && (
                    <Button size="sm" onClick={onAdmitAll}>
                      {labels('admit_all', { count: waiting.length })}
                    </Button>
                  )}
                  {onDenyAll && (
                    <Button size="sm" variant="outline" onClick={onDenyAll}>
                      {labels('deny_all', { count: waiting.length })}
                    </Button>
                  )}
                </div>
              )}
              {!!bulkRemaining && (
                <p role="status" className="mb-2 text-muted-foreground text-xs">
                  {labels('waiting_capacity', {
                    count: Math.min(bulkRemaining, waiting.length),
                  })}
                </p>
              )}
              <ul className="space-y-2">
                {waiting.map((entry) => (
                  <li
                    className="grid grid-cols-[1.75rem_minmax(0,1fr)_2rem_2rem] items-center gap-2 rounded-lg border bg-muted/30 p-2"
                    key={entry.userId}
                  >
                    <Avatar className="size-7">
                      <AvatarImage src={entry.avatarUrl} alt="" />
                      <AvatarFallback>
                        {entry.displayName.slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {entry.displayName}
                      {entry.guest ? (
                        <Badge variant="outline" className="ml-1.5">
                          {t('guest_join.badge')}
                        </Badge>
                      ) : null}
                    </span>
                    <Button
                      aria-label={`${t('admit')}: ${entry.displayName}`}
                      className="size-8 shrink-0"
                      onClick={() => onDecideAdmission(entry.userId, true)}
                      size="icon"
                      type="button"
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      aria-label={`${t('deny')}: ${entry.displayName}`}
                      className="size-8 shrink-0"
                      onClick={() => onDecideAdmission(entry.userId, false)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}

      <div className="flex items-center gap-2 px-4 pt-4 pb-2 font-medium text-sm">
        <Users className="size-4" />
        <span className="flex-1">{t('in_call')}</span>
        <Badge variant="outline">
          {participants.length + (miraActive ? 1 : 0)}
        </Badge>
      </div>
      <ul className="divide-y">
        {miraActive && (
          <li className="flex items-center gap-2 bg-primary/5 px-4 py-3">
            <MiraAvatar size={32} />
            <span className="flex-1 text-sm">Mira</span>
            <Badge variant="secondary">{t('official_assistant')}</Badge>
          </li>
        )}
        {ordered.map((participant) => {
          const isSelf = participant.userId === selfUserId;
          return (
            <li key={participant.userId}>
              <div className="group flex items-center gap-2 px-4 py-2.5">
                <Avatar className="size-8">
                  <AvatarImage src={participant.avatarUrl} alt="" />
                  <AvatarFallback>
                    {participant.displayName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {participant.displayName}
                  {participant.guest ? (
                    <Badge variant="outline" className="ml-1.5">
                      {t('guest_join.badge')}
                    </Badge>
                  ) : null}
                  {isSelf ? (
                    <span className="ml-1 text-muted-foreground">
                      ({t('you')})
                    </span>
                  ) : null}
                </span>
                {miraActive && <MiraAudioStatus participant={participant} />}
                {raisedHandUserIds.includes(participant.userId) ? (
                  <Hand className="size-3.5 shrink-0 text-dynamic-orange" />
                ) : null}
                {participant.media.audioEnabled ? null : (
                  <span
                    title={t('microphone_muted')}
                    className="grid size-7 shrink-0 place-items-center text-muted-foreground"
                  >
                    <MicOff aria-hidden="true" className="size-3.5" />
                    <span className="sr-only">{t('microphone_muted')}</span>
                  </span>
                )}
                {canManage && !isSelf ? (
                  <span className="flex gap-1">
                    {participant.media.audioEnabled ? (
                      <Button
                        aria-label={t('mute_participant', {
                          name: participant.displayName,
                        })}
                        className="size-7"
                        onClick={() => onMute(participant.userId)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <MicOff className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      aria-label={`${t('remove_participant')}: ${participant.displayName}`}
                      className="size-7 text-dynamic-red"
                      onClick={() => onRemove(participant.userId)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <UserMinus className="size-3.5" />
                    </Button>
                  </span>
                ) : null}
              </div>
              {canManage &&
                onMediaOverride &&
                !isSelf &&
                participant.role !== 'host' &&
                !participant.canManageParticipants && (
                  <details
                    className="px-4 pb-2 text-sm"
                    open={raised.has(participant.userId) || undefined}
                  >
                    <summary className="cursor-pointer text-muted-foreground">
                      {labels('media_overrides', {
                        name: participant.displayName,
                      })}
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {(['mic', 'camera', 'screen'] as const).map((kind) => {
                        const override =
                          settings?.mediaOverrides?.[participant.userId] ?? {};
                        const inherited = participant.accountId
                          ? settings?.mediaOverrides?.[participant.accountId]?.[
                              kind
                            ]
                          : undefined;
                        return (
                          <label
                            className="flex items-center gap-2 text-xs"
                            key={kind}
                          >
                            <Checkbox
                              checked={override[kind] ?? inherited ?? false}
                              onCheckedChange={(value) =>
                                onMediaOverride(participant.userId, {
                                  [kind]: value === true,
                                })
                              }
                            />
                            {labels(`allow_${kind}`)}
                          </label>
                        );
                      })}
                    </div>
                  </details>
                )}
            </li>
          );
        })}
      </ul>
      {isHost && (
        <RoomHostControls
          approved={approved}
          onForget={onForget}
          shareNotes={shareNotes}
          onShareNotes={onShareNotes}
        />
      )}
    </ScrollArea>
  );
}

export function RoomPermissionToggles({
  settings,
  onSettingsChange,
  onCamerasLockedChange,
  isHost,
}: {
  settings?: MeetRoomSettings;
  onSettingsChange?: (settings: Partial<MeetRoomSettings>) => void;
  onCamerasLockedChange?: (locked: boolean) => void;
  isHost: boolean;
}) {
  const labels = useLargeRoomLabels();
  const guestCopy = useTranslations('meet.call.guest_join');
  const entries = [
    { key: 'micsLocked', label: 'lock_mics', change: onSettingsChange },
    {
      key: 'camerasLocked',
      label: 'lock_cameras',
      change: onSettingsChange || onCamerasLockedChange,
    },
    { key: 'screensLocked', label: 'lock_screens', change: onSettingsChange },
    {
      key: 'skipLobby',
      label: 'skip_lobby',
      change: isHost && onSettingsChange,
    },
  ] as const;
  return (
    <>
      {entries
        .filter(({ change }) => !!change)
        .map(({ key, label }) => (
          <SettingsField key={key} label={labels(label)} layout="compact">
            {(field) => (
              <Switch
                {...field}
                checked={settings?.[key] ?? false}
                onCheckedChange={(value) => {
                  if (key === 'camerasLocked' && onCamerasLockedChange)
                    onCamerasLockedChange(value);
                  else onSettingsChange?.({ [key]: value });
                }}
              />
            )}
          </SettingsField>
        ))}
      {isHost && onSettingsChange && (
        <SettingsField
          label={guestCopy('setting_title')}
          description={guestCopy('setting_hint')}
          layout="compact"
        >
          {(field) => (
            <Switch
              {...field}
              checked={settings?.allowAnonymousGuests ?? false}
              onCheckedChange={(value) =>
                onSettingsChange({ allowAnonymousGuests: value })
              }
            />
          )}
        </SettingsField>
      )}
    </>
  );
}
