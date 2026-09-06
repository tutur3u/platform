'use client';

import {
  AudioLines,
  CalendarDays,
  CheckCheck,
  Download,
  ListTodo,
  NotebookPen,
  Sparkles,
  Wrench,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { LiveTranscriptEntry } from '../live-session-journal';
import type { LiveSessionNote, LiveToolActivity } from '../use-live-tools';
import { LiveActionPreview } from './live-action-preview';

export function LiveWorkspace({
  connected,
  authorizationExpired,
  speaking,
  listening,
  entries,
  activities,
  notes,
  decide,
  onPrompt,
  status,
  results,
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
  onPrompt: (text: string) => void;
  status: ReactNode;
  results: ReactNode;
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
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl border bg-background lg:overflow-hidden"
      aria-label={t('title')}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <AudioLines className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold tracking-tight">{t('title')}</h2>
            <p className="text-muted-foreground text-xs">{t('subtitle')}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={exportSession}
          disabled={!entries.length && !notes.length}
        >
          <Download className="size-4" />
          {t('export')}
        </Button>
      </header>
      {authorizationExpired && (
        <p role="status" className="border-b bg-muted px-4 py-3 text-sm">
          {t('expired')}
        </p>
      )}
      <div className="grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
        <main className="flex flex-col lg:min-h-0 lg:border-r">
          <div className="flex items-center justify-between gap-4 border-b bg-muted/20 px-4 py-4 sm:px-6">
            {status}
            <div aria-hidden="true" className="flex h-8 items-center gap-1">
              {[12, 20, 28, 16, 32, 24, 14, 26, 18].map((height, index) => (
                <span
                  key={`${index}-${height}`}
                  style={{
                    height: speaking || listening ? height : 4,
                    animationDelay: `${index * 80}ms`,
                  }}
                  className={cn(
                    'w-1 rounded-full bg-primary/60 transition-[height] motion-reduce:transition-none',
                    connected &&
                      (speaking || listening) &&
                      'motion-safe:animate-pulse'
                  )}
                />
              ))}
            </div>
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
            className="min-h-64 space-y-5 p-4 sm:p-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
          >
            {!entries.length ? (
              <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center py-6">
                <p className="mb-3 flex items-center gap-2 font-medium text-primary text-xs uppercase tracking-widest">
                  <Sparkles className="size-4" />
                  {t('eyebrow')}
                </p>
                <h3 className="max-w-sm font-semibold text-3xl leading-tight tracking-tight sm:text-4xl">
                  {t('welcome')}
                </h3>
                <p className="mt-4 max-w-md text-muted-foreground text-sm leading-relaxed">
                  {t('intro')}
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      { key: 'plan', icon: ListTodo },
                      { key: 'schedule', icon: CalendarDays },
                      { key: 'review', icon: CheckCheck },
                      { key: 'recap', icon: NotebookPen },
                    ] as const
                  ).map(({ key, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      disabled={!connected}
                      onClick={() => onPrompt(t(`prompts.${key}`))}
                      className="flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                    >
                      <Icon className="size-4 shrink-0 text-primary" />
                      {t(`shortcuts.${key}`)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              entries.map((entry) => (
                <article
                  key={entry.id}
                  className={cn(
                    'max-w-[95%]',
                    entry.role === 'user' && 'ml-auto'
                  )}
                >
                  <p className="mb-1.5 font-medium text-muted-foreground text-xs">
                    {entry.role === 'user' ? t('you') : 'Mira'}
                  </p>
                  <div
                    className={cn(
                      'whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-relaxed',
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
              ))
            )}
          </div>
          <div className="space-y-3 border-t bg-background p-3 sm:p-4">
            {controls}
            <p className="text-center text-muted-foreground text-xs">
              {t('privacy')}
            </p>
          </div>
        </main>
        <aside
          className="flex min-h-0 flex-col border-t bg-muted/15 lg:border-t-0"
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
            {panel === 'results' && (
              <>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {t('results_hint')}
                </p>
                {results}
              </>
            )}
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
                        {t.has(`tools.${activity.name}` as 'tools.create_task')
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
      </div>
      {children}
    </section>
  );
}
