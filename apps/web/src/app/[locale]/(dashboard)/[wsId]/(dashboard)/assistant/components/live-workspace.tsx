'use client';

import { Download, Wrench } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { LiveTranscriptEntry } from '../live-session-journal';
import type { LiveSessionNote, LiveToolActivity } from '../use-live-tools';
import { LiveActionPreview } from './live-action-preview';

export function LiveWorkspace({
  authorizationExpired,
  entries,
  activities,
  notes,
  decide,
  visualization,
  status,
  results,
  hasResults = false,
  controls,
  children,
}: {
  connected: boolean;
  authorizationExpired?: boolean;
  speaking: boolean;
  listening: boolean;
  entries: LiveTranscriptEntry[];
  activities: LiveToolActivity[];
  notes: LiveSessionNote[];
  decide: (id: string, allowed: boolean) => void;
  visualization: ReactNode;
  status: ReactNode;
  results: ReactNode;
  hasResults?: boolean;
  controls: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('dashboard.voice_assistant.studio');
  const transcriptRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  useEffect(() => {
    const node = transcriptRef.current;
    if (entries.length && node && followRef.current)
      node.scrollTop = node.scrollHeight;
  }, [entries]);
  const [panel, setPanel] = useState<'results' | 'activity' | 'notes'>(
    'results'
  );
  const approvals = activities.filter(
    (activity) => activity.status === 'approval'
  );
  const exportSession = () => {
    const text = [
      t('title'),
      '',
      ...entries.map(
        (entry) => `${entry.role === 'user' ? t('you') : 'Mira'}: ${entry.text}`
      ),
      '',
      t('notes'),
      ...notes.map((note) => `${note.title}\n${note.content}`),
    ].join('\n\n');
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/plain;charset=utf-8' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `mira-live-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section
      className="@container flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
      aria-label={t('title')}
    >
      {authorizationExpired && (
        <p role="status" className="border-b bg-muted px-4 py-3 text-sm">
          {t('expired')}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 px-3">
            {status}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={exportSession}
              disabled={!entries.length && !notes.length}
              aria-label={t('export')}
              title={t('export')}
            >
              <Download className="size-3.5" />
            </Button>
          </div>
          <div
            className={cn(
              'flex min-h-12 items-center justify-center overflow-hidden py-1',
              entries.length ? 'shrink' : 'flex-1'
            )}
          >
            {visualization}
          </div>
          <div
            ref={transcriptRef}
            onScroll={(event) => {
              const node = event.currentTarget;
              followRef.current =
                node.scrollHeight - node.scrollTop - node.clientHeight < 80;
            }}
            role="log"
            aria-label={t('transcript')}
            aria-live="polite"
            aria-relevant="additions text"
            className={cn(
              'mx-auto min-h-0 w-full max-w-2xl space-y-2 overflow-y-auto px-4 py-2',
              entries.length > 0 && 'flex-1'
            )}
          >
            {entries.slice(-3).map((entry) => (
              <article
                key={entry.id}
                className={cn(
                  'max-w-[95%]',
                  entry.role === 'user' && 'ml-auto'
                )}
              >
                <p className="mb-0.5 font-medium text-[10px] text-muted-foreground">
                  {entry.role === 'user' ? t('you') : 'Mira'}
                </p>
                <div
                  className={cn(
                    'whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm leading-relaxed',
                    entry.role === 'user'
                      ? 'rounded-tr-sm bg-muted'
                      : 'rounded-tl-sm border border-primary/10 bg-primary/5'
                  )}
                >
                  {entry.text}
                  {!entry.complete && (
                    <span
                      aria-hidden="true"
                      className="ml-1 inline-block size-1.5 rounded-full bg-primary motion-safe:animate-pulse"
                    />
                  )}
                </div>
                {entry.interrupted && (
                  <p className="mt-1 text-muted-foreground text-xs">
                    {t('interrupted')}
                  </p>
                )}
              </article>
            ))}
          </div>
          <div className="shrink-0 space-y-1 px-3 py-2">{controls}</div>
        </main>
        {(hasResults || activities.length > 0 || notes.length > 0) && (
          <aside
            className="flex max-h-48 min-h-0 shrink-0 flex-col border-t bg-muted/15"
            aria-label={t('workspace')}
          >
            <div className="flex gap-1 border-b p-2">
              {(['results', 'activity', 'notes'] as const).map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant={panel === key ? 'secondary' : 'ghost'}
                  aria-pressed={panel === key}
                  onClick={() => setPanel(key)}
                  className="flex-1"
                >
                  {t(key)}
                  {key === 'activity' && activities.length > 0 && (
                    <span className="text-xs tabular-nums">
                      {activities.length}
                    </span>
                  )}
                  {key === 'notes' && notes.length > 0 && (
                    <span className="text-xs tabular-nums">{notes.length}</span>
                  )}
                </Button>
              ))}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {approvals.map((activity) => (
                <div
                  key={activity.id}
                  className="space-y-3 rounded-xl border border-primary/30 bg-background p-4"
                >
                  <p className="font-medium text-sm">{t('approval_title')}</p>
                  <p className="text-sm">
                    {t(`tools.${activity.name}` as 'tools.create_task')}
                  </p>
                  <LiveActionPreview args={activity.args} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => decide(activity.id, true)}>
                      {t('approve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide(activity.id, false)}
                    >
                      {t('decline')}
                    </Button>
                  </div>
                </div>
              ))}
              {panel === 'results' && <>{results}</>}
              {panel === 'activity' &&
                (!activities.length ? (
                  <p className="py-6 text-muted-foreground text-sm">
                    {t('activity_empty')}
                  </p>
                ) : (
                  activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center gap-3 rounded-xl border bg-background p-3"
                    >
                      <Wrench className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">
                          {t.has(
                            `tools.${activity.name}` as 'tools.create_task'
                          )
                            ? t(`tools.${activity.name}` as 'tools.create_task')
                            : activity.name.replaceAll('_', ' ')}
                        </p>
                        <p
                          className="text-muted-foreground text-xs"
                          role="status"
                        >
                          {t(`statuses.${activity.status}`)}
                        </p>
                      </div>
                    </div>
                  ))
                ))}
              {panel === 'notes' && (
                <>
                  <p className="text-muted-foreground text-xs">
                    {t('notes_hint')}
                  </p>
                  {notes.map((note) => (
                    <article
                      key={note.id}
                      className="rounded-xl border bg-background p-4"
                    >
                      <h3 className="font-medium text-sm">{note.title}</h3>
                      <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground text-sm">
                        {note.content}
                      </p>
                    </article>
                  ))}
                </>
              )}
            </div>
          </aside>
        )}
      </div>
      {entries.length > 3 && (
        <details className="shrink-0 px-4 py-1 text-muted-foreground text-xs">
          <summary className="cursor-pointer">{t('transcript')}</summary>
          <div className="max-h-40 space-y-2 overflow-y-auto py-2">
            {entries.map((entry) => (
              <p key={entry.id}>
                <strong>{entry.role === 'user' ? t('you') : 'Mira'}: </strong>
                {entry.text}
              </p>
            ))}
          </div>
        </details>
      )}
      {children}
    </section>
  );
}
