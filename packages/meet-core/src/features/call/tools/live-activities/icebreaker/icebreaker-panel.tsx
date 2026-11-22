'use client';

import { Eye, EyeOff, MessageCircleQuestion, Send, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ToolAction, ToolIconAction } from '../../tool-ui';
import {
  ActivityEmpty,
  ActivityNotice,
  ActivitySection,
  type Activity,
  useActivity,
} from '../activity-kit';
import type { MeetToolPanelProps } from '../meet-tool';
import { LiveActivityPanelFrame } from '../panel-frame';
import { useRoomDraft } from '../room-draft';

const SUGGESTIONS = ['weekend', 'learned', 'song', 'superpower'] as const;

/** The host asks the room one question: a suggestion or their own words. */
function PromptPicker({ send }: { send: Activity['send'] }) {
  const t = useTranslations('meet.call.live_activities.icebreaker');
  const [custom, setCustom] = useState('');
  const ask = (text: string) => send({ kind: 'icebreaker.prompt', text });
  return (
    <div className="space-y-3">
      <ul className="grid gap-1.5">
        {SUGGESTIONS.map((key) => (
          <li key={key}>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 w-full justify-start whitespace-normal rounded-2xl px-4 py-2 text-left"
              onClick={() => ask(t(`suggestions.${key}`))}
            >
              {t(`suggestions.${key}`)}
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (custom.trim()) ask(custom.trim());
        }}
      >
        <Input
          value={custom}
          maxLength={200}
          aria-label={t('custom_prompt')}
          placeholder={t('custom_prompt')}
          onChange={(event) => setCustom(event.target.value)}
        />
        <ToolAction
          icon={Send}
          type="submit"
          label={t('ask')}
          variant="default"
          disabled={!custom.trim()}
        />
      </form>
    </div>
  );
}

/** One reply per person; sending again replaces it. */
function ResponseForm({
  promptId,
  mine,
  send,
}: {
  /** The question on screen: the room refuses a reply to an earlier one. */
  promptId: string | null;
  mine: string | undefined;
  send: Activity['send'];
}) {
  const t = useTranslations('meet.call.live_activities.icebreaker');
  // Their own reply can arrive after the question; typed text always wins.
  const [draft, setDraft] = useRoomDraft(mine ?? '');
  const text = draft.trim();
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (text && promptId)
          send({ kind: 'icebreaker.respond', promptId, text });
      }}
    >
      <Input
        value={draft}
        maxLength={200}
        aria-label={t('your_response')}
        placeholder={t('your_response')}
        onChange={(event) => setDraft(event.target.value)}
      />
      <ToolAction
        icon={Send}
        type="submit"
        label={t(mine ? 'update' : 'send')}
        variant="default"
        disabled={!text || !promptId || text === mine}
      />
    </form>
  );
}

/**
 * A warm-up question for the room. Everyone answers once and reads the
 * others' answers; hosts and co-hosts pick the question and can hide a reply.
 */
export function IcebreakerPanel({ onClose }: MeetToolPanelProps) {
  const activity = useActivity();
  const t = useTranslations('meet.call.live_activities.icebreaker');
  const { prompt, promptId, responses } = activity.snapshot.icebreaker;
  const hidden = activity.host?.icebreaker.hidden ?? [];
  const hide = (responseId: string, value: boolean) =>
    activity.send({ kind: 'icebreaker.hide', responseId, hidden: value });
  return (
    <LiveActivityPanelFrame
      title={t('title')}
      icon={MessageCircleQuestion}
      onClose={onClose}
    >
      {prompt === null ? (
        activity.canManage ? (
          <PromptPicker send={activity.send} />
        ) : (
          <ActivityEmpty>{t('empty_participant')}</ActivityEmpty>
        )
      ) : (
        <>
          <div className="flex items-start gap-2 rounded-2xl border bg-card p-4">
            <p className="min-w-0 flex-1 wrap-break-word text-balance font-semibold text-base">
              {prompt}
            </p>
            {activity.canManage && (
              <ToolIconAction
                icon={X}
                label={t('clear_prompt')}
                onClick={() =>
                  activity.send({ kind: 'icebreaker.prompt', text: null })
                }
              />
            )}
          </div>
          <ResponseForm
            // A new question starts from an empty reply.
            key={promptId}
            promptId={promptId}
            mine={activity.mine.icebreaker.text}
            send={activity.send}
          />
          <ActivitySection title={t('responses', { count: responses.length })}>
            {responses.length ? (
              <ul className="space-y-1.5">
                {responses.map((response) => (
                  <li
                    key={response.id}
                    className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-xs">
                        {activity.nameOf(response.participantId)}
                      </p>
                      <p className="wrap-break-word text-sm">{response.text}</p>
                    </div>
                    {activity.canManage && (
                      <ToolIconAction
                        icon={EyeOff}
                        label={t('hide_response', {
                          name: activity.nameOf(response.participantId),
                        })}
                        onClick={() => hide(response.id, true)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('no_responses')}
              </p>
            )}
          </ActivitySection>
          {activity.canManage && hidden.length > 0 && (
            <ActivitySection title={t('hidden', { count: hidden.length })}>
              <ul className="space-y-1.5">
                {hidden.map((response) => (
                  <li
                    key={response.id}
                    className="flex items-start gap-2 rounded-xl border border-dashed px-3 py-2 text-muted-foreground"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-xs">
                        {activity.nameOf(response.participantId)}
                      </p>
                      <p className="wrap-break-word text-sm">{response.text}</p>
                    </div>
                    <ToolIconAction
                      icon={Eye}
                      label={t('show_response', {
                        name: activity.nameOf(response.participantId),
                      })}
                      onClick={() => hide(response.id, false)}
                    />
                  </li>
                ))}
              </ul>
            </ActivitySection>
          )}
        </>
      )}
      <ActivityNotice error={activity.error} />
    </LiveActivityPanelFrame>
  );
}
