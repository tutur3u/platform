'use client';

import { Hand, LogIn, Megaphone, Plus, Square, Timer } from '@tuturuuu/icons';
import {
  type BreakoutMode,
  type ClassroomMutation,
  breakoutModes,
  MAX_BREAKOUT_DURATION_MINUTES,
  MAX_BREAKOUT_GROUPS,
} from '@tuturuuu/realtime/meet/classroom-tools-schema';
import type { BreakoutsView } from '@tuturuuu/realtime/meet/room-breakouts';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const selectClass =
  'min-h-9 min-w-0 rounded-md border bg-background px-2 text-sm';

export function Breakouts({
  view,
  busy,
  onAction,
}: {
  view: BreakoutsView;
  busy: boolean;
  onAction: (command: ClassroomMutation) => void;
}) {
  const t = useTranslations('meet.classroom_tools.breakouts');
  const [mode, setMode] = useState<BreakoutMode>('auto');
  const [count, setCount] = useState('4');
  const [minutes, setMinutes] = useState('10');
  const [message, setMessage] = useState('');
  const { actorId, canManage, participants, serverNow, session } = view;
  if (!session) {
    if (!canManage)
      return <p className="text-muted-foreground text-sm">{t('waiting')}</p>;
    return (
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onAction({
            action: 'breakouts.create',
            sessionId: crypto.randomUUID(),
            mode,
            roomCount: Number(count),
            durationMinutes: Number(minutes),
          });
        }}
      >
        <fieldset disabled={busy} className="grid gap-3">
          <label className="grid gap-1 text-sm">
            {t('mode')}
            <select
              className={selectClass}
              value={mode}
              onChange={(event) => {
                const next = breakoutModes.find(
                  (entry) => entry === event.target.value
                );
                if (next) setMode(next);
              }}
            >
              {breakoutModes.map((entry) => (
                <option key={entry} value={entry}>
                  {t(entry)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm">
              {t('room_count')}
              <Input
                type="number"
                required
                min={2}
                max={MAX_BREAKOUT_GROUPS}
                placeholder={t('placeholder_count')}
                value={count}
                onChange={(event) => setCount(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              {t('duration')}
              <Input
                type="number"
                required
                min={1}
                max={MAX_BREAKOUT_DURATION_MINUTES}
                placeholder={t('placeholder_minutes')}
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
            </label>
          </div>
          <Button type="submit" size="sm" className="justify-self-start">
            <Plus />
            {t('open')}
          </Button>
        </fieldset>
      </form>
    );
  }

  const { id: sessionId, groups } = session;
  const seconds = Math.max(0, Math.ceil((session.endsAt - serverNow) / 1000));
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const belongs = groups.find(({ memberIds }) => memberIds.includes(actorId));
  const visibleGroups =
    canManage || session.mode === 'student_pick'
      ? groups
      : belongs
        ? [belongs]
        : [];
  const names = new Map(participants.map(({ id, name }) => [id, name]));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm tabular-nums">
          <Timer className="size-4" />
          {t('remaining', { clock })}
        </span>
        {canManage && (
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                onAction({ action: 'breakouts.extend', sessionId })
              }
            >
              <Timer />
              {t('extend')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onAction({ action: 'breakouts.close', sessionId })}
            >
              <Square />
              {t('close')}
            </Button>
          </div>
        )}
      </div>
      {session.broadcast && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md bg-muted p-2 text-sm"
        >
          <Megaphone className="size-4 shrink-0" />
          <span className="break-words">{session.broadcast}</span>
        </p>
      )}
      {canManage && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!message.trim()) return;
            onAction({ action: 'breakouts.broadcast', sessionId, message });
            setMessage('');
          }}
        >
          <Input
            aria-label={t('message')}
            placeholder={t('message')}
            maxLength={300}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <Button
            type="submit"
            disabled={busy || !message.trim()}
            size="icon"
            variant="outline"
            aria-label={t('send')}
            title={t('send')}
          >
            <Megaphone />
          </Button>
        </form>
      )}
      {visibleGroups.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('unassigned')}</p>
      )}
      {visibleGroups.map((group) => {
        const members = group.memberIds.flatMap((id) => {
          const name = names.get(id);
          return name ? [{ id, name }] : [];
        });
        const joined = belongs?.id === group.id;
        return (
          <section
            key={group.id}
            className="grid gap-2 rounded-md border p-2.5"
          >
            <h3 className="font-medium text-sm">
              {t('group', { number: group.id })}
            </h3>
            {members.length > 0 && (
              <ul className="flex flex-wrap gap-1">
                {members.map(({ id, name }) => (
                  <li
                    key={id}
                    className="rounded-md bg-muted px-2 py-1 text-xs"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-1">
              {!joined && !canManage && session.mode === 'student_pick' && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    onAction({
                      action: 'breakouts.join',
                      sessionId,
                      groupId: group.id,
                    })
                  }
                >
                  <LogIn />
                  {t('choose')}
                </Button>
              )}
              {(joined || (canManage && group.needsHelp)) && (
                <Button
                  type="button"
                  size="sm"
                  variant={group.needsHelp ? 'secondary' : 'outline'}
                  disabled={busy}
                  onClick={() =>
                    onAction({
                      action: 'breakouts.help',
                      sessionId,
                      groupId: group.id,
                      requested: !group.needsHelp,
                    })
                  }
                >
                  <Hand />
                  {t(group.needsHelp ? 'dismiss_help' : 'request_help')}
                </Button>
              )}
            </div>
          </section>
        );
      })}
      {canManage && participants.length > 0 && (
        <section className="grid gap-2">
          <h3 className="font-medium text-sm">{t('assignments')}</h3>
          {participants.map(({ id, name }) => (
            <label
              key={id}
              className="grid grid-cols-2 items-center gap-2 text-sm"
            >
              <span className="truncate">{name}</span>
              <select
                className={selectClass}
                disabled={busy}
                value={
                  groups.find(({ memberIds }) => memberIds.includes(id))?.id ??
                  ''
                }
                onChange={(event) =>
                  onAction({
                    action: 'breakouts.assign',
                    sessionId,
                    participantId: id,
                    groupId: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              >
                <option value="">{t('unassigned')}</option>
                {groups.map(({ id }) => (
                  <option key={id} value={id}>
                    {t('group', { number: id })}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </section>
      )}
    </div>
  );
}
