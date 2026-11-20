'use client';

import { Ellipsis, MicOff, UserMinus } from '@tuturuuu/icons';
import type {
  MeetRealtimePresence,
  MeetRoomSettings,
} from '@tuturuuu/realtime/meet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useLargeRoomLabels } from '../lib/large-room-labels';

type Override = NonNullable<MeetRoomSettings['mediaOverrides']>[string];

export function ParticipantActions({
  person,
  settings,
  onMute,
  onRemove,
  onMediaOverride,
  onPromote,
}: {
  person: MeetRealtimePresence;
  settings?: MeetRoomSettings;
  onMute: (id: string) => void;
  onRemove: (id: string) => void;
  onMediaOverride?: (id: string, override: Override) => void;
  onPromote?: (id: string) => void;
}) {
  const t = useTranslations('meet.call');
  const labels = useLargeRoomLabels();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const canOverride =
    onMediaOverride &&
    person.role === 'speaker' &&
    !person.canManageParticipants;
  const override = settings?.mediaOverrides?.[person.userId];
  const inherited = person.accountId
    ? settings?.mediaOverrides?.[person.accountId]
    : undefined;

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            aria-label={t('room_tools.member_actions', {
              name: person.displayName,
            })}
            className="size-8 shrink-0 pointer-coarse:size-11"
            size="icon"
            type="button"
            variant="ghost"
          >
            <Ellipsis className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (confirmOpen) event.preventDefault();
          }}
        >
          {person.role === 'viewer' && onPromote && (
            <DropdownMenuItem onSelect={() => onPromote(person.userId)}>
              {t('promote_to_speaker')}
            </DropdownMenuItem>
          )}
          {person.media.audioEnabled && (
            <DropdownMenuItem
              onSelect={() => {
                setMenuOpen(false);
                onMute(person.userId);
              }}
            >
              <MicOff />
              {t('mute_participant', { name: person.displayName })}
            </DropdownMenuItem>
          )}
          {canOverride && (
            <>
              {(['mic', 'camera', 'screen'] as const).map((kind) => (
                <DropdownMenuCheckboxItem
                  key={kind}
                  checked={override?.[kind] ?? inherited?.[kind] ?? false}
                  onCheckedChange={(value) =>
                    onMediaOverride(person.userId, { [kind]: value === true })
                  }
                  onSelect={(event) => event.preventDefault()}
                >
                  {labels(`allow_${kind}`)}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              setConfirmOpen(true);
              setMenuOpen(false);
            }}
          >
            <UserMinus />
            {t('remove_participant')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t('remove_participant')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('room_tools.confirm_remove', { name: person.displayName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={() => onRemove(person.userId)}
              >
                {t('remove_participant')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
