'use client';
import { Check, Hand, MicOff, UserRoundPlus, Users, X } from '@tuturuuu/icons';
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
import { Input } from '@tuturuuu/ui/input';
import { Button } from '@tuturuuu/ui/button';
import { SettingsField } from '../../../../../ui/src/components/ui/custom/settings-field';
import { Switch } from '@tuturuuu/ui/switch';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useLargeRoomLabels } from '../lib/large-room-labels';
import { MiraAudioStatus } from './mira-audio-status';
import { MiraAvatar } from './mira-profile';
import { ParticipantActions } from './participant-actions';
import { RoomHostControls } from './room-host-controls';
export function ParticipantsPanel({
  approved,
  miraActive = false,
  onForget,
  canManage,
  onAdmitAll,
  onDenyAll,
  onSettingsChange,
  onCamerasLockedChange,
  onMediaOverride,
  onPromote,
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
  onPromote?: (userId: string) => void;
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
  const presenceOnly = settings?.transport === 'presence';
  const [search, setSearch] = useState('');
  const query = participants.length > 8 ? search.trim().toLowerCase() : '';
  const raised = new Set(raisedHandUserIds);
  const ordered = participants
    .filter((person) => person.displayName.toLowerCase().includes(query))
    .sort(
      (a, b) => Number(raised.has(b.userId)) - Number(raised.has(a.userId))
    );

  return (
    <ScrollArea className="min-h-0 flex-1">
      {canManage && waiting.length ? (
        <Accordion
          type="multiple"
          defaultValue={['requests']}
          className="border-b px-4"
        >
          <AccordionItem value="requests" className="border-0">
            <AccordionTrigger className="gap-2 text-sm">
              <span aria-hidden="true" className="shrink-0">
                <UserRoundPlus className="size-4" />
              </span>
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
                    className="grid grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2"
                    key={entry.userId}
                  >
                    <Avatar className="size-8 pointer-coarse:size-11">
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
                      {entry.unverified ? (
                        <Badge variant="destructive" className="ml-1.5">
                          {t('guest_join.unverified_badge')}
                        </Badge>
                      ) : null}
                    </span>
                    <Button
                      aria-label={`${t('admit')}: ${entry.displayName}`}
                      className="size-8 shrink-0 pointer-coarse:size-11"
                      onClick={() => onDecideAdmission(entry.userId, true)}
                      size="icon"
                      type="button"
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      aria-label={`${t('deny')}: ${entry.displayName}`}
                      className="size-8 shrink-0 pointer-coarse:size-11"
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

      <div className="sticky top-0 z-10 grid gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Users className="size-4" aria-hidden="true" />
          <span className="flex-1">{t('in_call')}</span>
          <Badge variant="outline">
            {participants.length + (miraActive ? 1 : 0)}
          </Badge>
        </div>
        {participants.length > 8 && (
          <Input
            type="search"
            aria-label={t('room_tools.search')}
            placeholder={t('room_tools.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8"
          />
        )}
      </div>
      <ul className="divide-y">
        {miraActive && 'mira'.includes(query) && (
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
              <div className="group flex min-h-12 items-center gap-3 px-4 py-2">
                <Avatar className="size-8 shrink-0">
                  <AvatarImage src={participant.avatarUrl} alt="" />
                  <AvatarFallback>
                    {participant.displayName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {participant.displayName}
                  {participant.role === 'viewer' && (
                    <Badge variant="outline" className="ml-1.5">
                      {t('viewer_role')}
                    </Badge>
                  )}
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
                {miraActive && !presenceOnly && (
                  <MiraAudioStatus participant={participant} />
                )}
                {raisedHandUserIds.includes(participant.userId) ? (
                  <Hand className="size-3.5 shrink-0 text-dynamic-orange" />
                ) : null}
                {presenceOnly || participant.media.audioEnabled ? null : (
                  <span
                    title={t('microphone_muted')}
                    className="grid size-7 shrink-0 place-items-center text-muted-foreground"
                  >
                    <MicOff aria-hidden="true" className="size-3.5" />
                    <span className="sr-only">{t('microphone_muted')}</span>
                  </span>
                )}
                {canManage && !isSelf && (
                  <ParticipantActions
                    person={participant}
                    settings={settings}
                    onMute={onMute}
                    onRemove={onRemove}
                    onMediaOverride={onMediaOverride}
                    onPromote={isHost ? onPromote : undefined}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {query && !ordered.length && !(miraActive && 'mira'.includes(query)) && (
        <p role="status" className="px-4 py-3 text-muted-foreground text-sm">
          {t('room_tools.no_matches')}
        </p>
      )}
      {canManage && (onSettingsChange || onCamerasLockedChange) && (
        <Accordion type="single" collapsible className="border-t px-4">
          <AccordionItem value="room-permissions" className="border-0">
            <AccordionTrigger className="gap-2 text-sm">
              {labels('settings_permissions')}
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <RoomPermissionToggles
                settings={settings}
                isHost={isHost}
                onSettingsChange={onSettingsChange}
                onCamerasLockedChange={onCamerasLockedChange}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
      {isHost && <RoomHostControls approved={approved} onForget={onForget} />}
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
          <SettingsField
            key={key}
            label={labels(label)}
            description={
              key === 'skipLobby' ? labels('skip_lobby_hint') : undefined
            }
            layout="compact"
          >
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
