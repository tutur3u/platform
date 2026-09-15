'use client';
import type { MeetAiSession } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { FollowupReview } from './followup-review';
import type { MeetingFollowup } from './followup-types';

export function MeetingFollowups({
  session,
  meetingId,
  wsId,
}: {
  session: MeetAiSession;
  meetingId: string;
  wsId: string;
}) {
  const t = useTranslations('meet.ai');
  const [selected, setSelected] = useState<MeetingFollowup | null>(null);
  const suggestions = useMemo(() => {
    const tasks: MeetingFollowup[] = (session.notes?.actionItems ?? []).map(
      (item, index) => ({
        key: `${session.id}:task:${index}`,
        kind: 'task',
        title: item.task,
        evidence: item.task,
        owner: item.owner,
        timeText: item.dueDate,
        startLocal: null,
        endLocal: null,
        timezone: null,
      })
    );
    const events: MeetingFollowup[] = (
      session.notes?.calendarSuggestions ?? []
    ).map((item, index) => ({
      ...item,
      key: `${session.id}:event:${index}`,
      kind: 'event',
      owner: null,
    }));
    const seen = new Set<string>();
    return [...tasks, ...events].filter((item) => {
      const key = `${item.kind}:${item.title.trim().toLocaleLowerCase()}`;
      if (seen.has(key) || !item.title.trim()) return false;
      seen.add(key);
      return true;
    });
  }, [session]);
  if (!suggestions.length) return null;
  return (
    <section className="space-y-3 rounded-lg border p-3">
      <h4 className="font-semibold">{t('followup_heading')}</h4>
      <p className="text-muted-foreground text-xs">{t('followup_hint')}</p>
      {suggestions.map((suggestion) => (
        <div key={suggestion.key} className="space-y-2 border-t pt-3">
          <p className="font-medium">{suggestion.title}</p>
          {(suggestion.owner || suggestion.timeText) && (
            <p className="text-muted-foreground text-xs">
              {[suggestion.owner, suggestion.timeText]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelected(suggestion)}
            >
              {t(
                suggestion.kind === 'task'
                  ? 'followup_review_task'
                  : 'followup_review_event'
              )}
            </Button>
            {suggestion.kind === 'task' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setSelected({
                    ...suggestion,
                    kind: 'event',
                    key: `${suggestion.key}:time`,
                  })
                }
              >
                {t('followup_schedule_time')}
              </Button>
            )}
          </div>
        </div>
      ))}
      {selected && (
        <FollowupReview
          key={selected.key}
          suggestion={selected}
          wsId={wsId}
          meetingId={meetingId}
          sourceUrl={`https://meet.tuturuuu.com/${encodeURIComponent(wsId)}/meetings/${encodeURIComponent(meetingId)}`}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
