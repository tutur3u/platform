'use client';

import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { CalendarDays, Code2, FileText, MessageSquare } from '@tuturuuu/icons';
import type { MeetRoomSettings } from '@tuturuuu/realtime/meet';
import { Badge } from '@tuturuuu/ui/badge';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId } from 'react';
import { ControlButton } from './control-bar';

type Mode = NonNullable<MeetRoomSettings['advancedTools']>;
const modes = ['hosts', 'showcase', 'everyone'] as const;

export function useRoomTools(
  mode: Mode | undefined,
  managesParticipants: boolean
) {
  return {
    canConfigure: MEETING_APP === 'meet' && managesParticipants,
    canUse:
      MEETING_APP === 'meet' && (managesParticipants || mode === 'everyone'),
    showPreview:
      MEETING_APP === 'meet' && !managesParticipants && mode === 'showcase',
  };
}

export function CallRoomTools({
  mode = 'hosts',
  policy,
  onMode,
  actions,
  activities,
}: {
  mode?: Mode;
  policy: ReturnType<typeof useRoomTools>;
  onMode: (mode: Mode) => void;
  actions: {
    personal: { active: boolean; toggle: () => void };
    programming: { active: boolean; toggle: () => void };
    document: { active: boolean; toggle: () => void };
    feedback: () => void;
  };
  activities: ReactNode;
}) {
  const t = useTranslations('meet.call.room_tools');
  const privateT = useTranslations('meet.call.private_tools');
  const pollsT = useTranslations('meet.call.polls');
  const quizT = useTranslations('meet.call.quizArena');
  const programmingT = useTranslations('programmingPlayground');
  const collaborationT = useTranslations('meet.collaboration');
  const id = useId();

  if (MEETING_APP !== 'meet') return null;
  return (
    <>
      {(policy.canUse || policy.showPreview) && (
        <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
          <p className="font-medium text-muted-foreground text-xs">
            {t('title')}
          </p>
          {policy.showPreview && (
            <Badge variant="outline">{t('preview')}</Badge>
          )}
        </div>
      )}
      {activities}
      {policy.canUse && (
        <>
          <ControlButton
            active={actions.personal.active}
            icon={CalendarDays}
            label={privateT('title')}
            onClick={actions.personal.toggle}
          />
          <ControlButton
            active={actions.programming.active}
            icon={Code2}
            label={programmingT('coding')}
            onClick={actions.programming.toggle}
          />
          <ControlButton
            active={actions.document.active}
            icon={FileText}
            label={collaborationT('document')}
            onClick={actions.document.toggle}
          />
        </>
      )}
      {policy.showPreview && (
        <>
          <p className="px-3 py-1 text-muted-foreground text-xs">
            {t('preview_hint')}
          </p>
          <ul className="grid gap-1 px-3 py-1 text-muted-foreground text-sm">
            {[
              pollsT('title'),
              quizT('title'),
              programmingT('coding'),
              collaborationT('document'),
            ].map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
          <ControlButton
            icon={MessageSquare}
            label={t('feedback')}
            onClick={actions.feedback}
          />
        </>
      )}
      {policy.canConfigure && (
        <div className="mt-1 space-y-2 border-t px-3 pt-3 pb-2">
          <p id={id} className="font-medium text-sm">
            {t('visibility')}
          </p>
          <RadioGroup
            aria-labelledby={id}
            value={mode}
            onValueChange={(value) => {
              const next = modes.find((entry) => entry === value);
              if (next) onMode(next);
            }}
            className="gap-1"
          >
            {modes.map((entry) => (
              <label
                key={entry}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-accent"
              >
                <RadioGroupItem value={entry} className="mt-0.5 shrink-0" />
                <span className="grid gap-0.5 text-sm">
                  {t(entry)}
                  <span className="text-muted-foreground text-xs">
                    {t(`${entry}_hint`)}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </div>
      )}
    </>
  );
}
