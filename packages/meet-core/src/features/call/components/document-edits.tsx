'use client';
import { Check, GitCompare, Undo2 } from '@tuturuuu/icons';
import type { MeetingDocumentMiraEdit } from '@tuturuuu/internal-api/meet-call';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';
import { MiraAttributionPill } from './document-mira-presence';

export function DocumentEdits({
  edits,
  pending,
  canReview,
  onReview,
}: {
  edits: MeetingDocumentMiraEdit[];
  pending: boolean;
  canReview: (edit: MeetingDocumentMiraEdit) => boolean;
  onReview: (
    edit: MeetingDocumentMiraEdit,
    decision: 'accepted' | 'reverted'
  ) => void;
}) {
  const t = useTranslations('meet.collaboration');
  const format = useFormatter();
  const now = useNow({ updateInterval: 15_000 });
  const [diff, setDiff] = useState<ReadonlySet<string>>(new Set());
  if (!edits.length) return null;
  return (
    <section
      aria-label={t('mira_edits')}
      className="max-h-64 shrink-0 space-y-3 overflow-y-auto border-border border-t px-6 py-3 sm:px-8"
    >
      {edits.map((edit) => {
        const showDiff = diff.has(edit.id);
        return (
          <article
            key={edit.id}
            className="relative rounded-xl border border-dynamic-purple/25 bg-dynamic-purple/5 py-3 pr-3.5 pl-5 text-sm leading-relaxed"
          >
            <span
              aria-hidden="true"
              className="absolute top-2.5 bottom-2.5 left-1.5 w-0.75 rounded-full bg-dynamic-purple"
            />
            {showDiff ? (
              <p className="whitespace-pre-line">
                {edit.before && (
                  <del className="rounded bg-dynamic-red/10 px-1 text-dynamic-red">
                    {edit.before}
                  </del>
                )}{' '}
                <ins className="rounded bg-dynamic-green/10 px-1 text-dynamic-green no-underline">
                  {edit.after}
                </ins>
              </p>
            ) : (
              <p className="line-clamp-4 whitespace-pre-line">{edit.after}</p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <MiraAttributionPill source={edit.source} action={edit.action} />
              <span className="font-semibold text-muted-foreground text-xs">
                {t('mira_asked_by', {
                  name: edit.askedByName ?? t('someone'),
                  time: format.relativeTime(edit.createdAt, now),
                })}
              </span>
              <span className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="xs"
                  aria-pressed={showDiff}
                  className={cn(
                    'rounded-full px-2.5',
                    showDiff &&
                      'bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/15 hover:text-dynamic-green'
                  )}
                  onClick={() =>
                    setDiff((current) => {
                      const next = new Set(current);
                      if (next.has(edit.id)) next.delete(edit.id);
                      else next.add(edit.id);
                      return next;
                    })
                  }
                >
                  <GitCompare className="size-3.5" />
                  {t('mira_diff')}
                </Button>
                {edit.review === 'pending' && canReview(edit) ? (
                  <>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="rounded-full px-2.5"
                      disabled={pending}
                      onClick={() => onReview(edit, 'reverted')}
                    >
                      <Undo2 className="size-3.5" />
                      {t('mira_undo')}
                    </Button>
                    <Button
                      size="xs"
                      className="rounded-full px-2.5"
                      disabled={pending}
                      onClick={() => onReview(edit, 'accepted')}
                    >
                      <Check className="size-3.5" />
                      {t('mira_accept')}
                    </Button>
                  </>
                ) : edit.review !== 'pending' ? (
                  <span className="px-1 font-semibold text-muted-foreground text-xs">
                    {t(
                      edit.review === 'accepted'
                        ? 'mira_accepted'
                        : 'mira_reverted'
                    )}
                  </span>
                ) : null}
              </span>
            </div>
          </article>
        );
      })}
    </section>
  );
}
