'use client';

import { LockKeyhole, Users } from '@tuturuuu/icons';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useId, useState } from 'react';
import type { CallState } from '../lib/call-state';
import { PersonalTimer } from '../tools/timers/personal-timer';
import { canStartClassTimer, ClassTimerControls } from './class-timer';

export type RoomTimer = { meetingId: string; state: CallState };
export type TimerMode = 'me' | 'everyone';

const RoomTimerContext = createContext<RoomTimer | null>(null);

/**
 * The call's room timer for the Timer pane. Only Meet UX v2 provides it;
 * without it the pane stays the private countdown.
 */
export const RoomTimerProvider = RoomTimerContext.Provider;

export function useRoomTimer() {
  return useContext(RoomTimerContext);
}

/**
 * Why this person cannot set a timer for everyone, or null when they can:
 * the room has no shared timer, or only hosts and co-hosts may set it.
 */
export function everyoneBlockedReason(state: CallState) {
  if (canStartClassTimer(state)) return null;
  return state.classTimerEnabled
    ? ('class_timer_everyone_role' as const)
    : ('class_timer_everyone_off' as const);
}

/** Hosts and co-hosts start on Everyone; everyone else on Just me. */
export const defaultTimerMode = (state: CallState): TimerMode =>
  canStartClassTimer(state) ? 'everyone' : 'me';

/**
 * Meet UX v2's one Timer. Just me is the device-local countdown and never
 * writes room state. Everyone is the room timer, with its server rules:
 * hosts and co-hosts set it, the host pauses and stops it. People who may
 * not set it see Everyone disabled with the reason.
 */
export function TimerModes({ room }: { room: RoomTimer }) {
  const t = useTranslations('meet.call');
  const reasonId = useId();
  const { meetingId, state } = room;
  const [chosen, setChosen] = useState<TimerMode>(() =>
    defaultTimerMode(state)
  );
  const blocked = everyoneBlockedReason(state);
  // A person who loses the role falls back to their own timer.
  const mode: TimerMode = blocked ? 'me' : chosen;
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <ToggleGroup
          aria-label={t('class_timer_mode')}
          className="w-full"
          onValueChange={(next) => {
            if (next === 'me' || next === 'everyone') setChosen(next);
          }}
          size="sm"
          type="single"
          value={mode}
          variant="outline"
        >
          <ToggleGroupItem className="flex-1 gap-1.5" value="me">
            <LockKeyhole aria-hidden="true" className="size-4" />
            {t('class_timer_mode_me')}
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-describedby={blocked ? reasonId : undefined}
            className="flex-1 gap-1.5"
            disabled={!!blocked}
            value="everyone"
          >
            <Users aria-hidden="true" className="size-4" />
            {t('class_timer_mode_everyone')}
          </ToggleGroupItem>
        </ToggleGroup>
        {blocked && (
          <p className="text-muted-foreground text-xs" id={reasonId}>
            {t(blocked)}
          </p>
        )}
      </div>
      {mode === 'everyone' ? (
        <ClassTimerControls meetingId={meetingId} state={state} />
      ) : (
        <PersonalTimer />
      )}
    </div>
  );
}
