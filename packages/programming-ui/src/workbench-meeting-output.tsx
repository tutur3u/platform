'use client';

import {
  Bookmark,
  Check,
  Globe,
  ListChecks,
  Sparkles,
  TerminalSquare,
  X,
} from '@tuturuuu/icons';
import type { MeetProgrammingTestCase } from '@tuturuuu/internal-api/meet-call';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { classNames as cn } from './class-names';
import { WorkbenchFailureNotice } from './workbench-failure-notice';
import type { SaveState } from './workbench-layout';
import { WorkbenchOutput, type WorkbenchPreview } from './workbench-output';
import {
  type WorkbenchRunner,
  WorkbenchRunnerUnavailable,
} from './workbench-runner-unavailable';

export type WorkbenchTestRun = {
  submissionId: string;
  output: string;
  cases: MeetProgrammingTestCase[];
};

type SharedOutput = Parameters<typeof WorkbenchOutput>[0];
export type OutputTab = 'tests' | 'console' | 'preview';

export function WorkbenchMeetingOutput({
  tab,
  onTab,
  test,
  testing,
  canTest,
  selectedFailureIndex,
  onSelectFailure,
  failureLink,
  checkpoint,
  preview,
  runner,
  ...output
}: Omit<SharedOutput, 'open' | 'onToggle' | 'embedded' | 'preview'> & {
  tab: OutputTab;
  onTab: (tab: OutputTab) => void;
  test?: WorkbenchTestRun;
  testing: boolean;
  canTest: boolean;
  selectedFailureIndex?: number;
  onSelectFailure?: (index: number) => void;
  failureLink?: { index: number; line: number; jump: () => void };
  checkpoint?: { pending: boolean; save: () => void; state: SaveState };
  preview?: WorkbenchPreview;
  /** Set once Meet's runner reported it cannot take runs; the card stays above every tab. */
  runner?: WorkbenchRunner;
}) {
  const t = useTranslations('programmingPlayground');
  const id = useId();
  const tabs = [
    { value: 'tests', label: t('tests'), icon: ListChecks },
    { value: 'console', label: t('console'), icon: TerminalSquare },
    { value: 'preview', label: t('webPreview'), icon: Globe },
  ] as const;
  const failed = test?.cases.filter((item) => !item.passed) ?? [];
  const selectedFailure =
    failed.find((item) => item.index === selectedFailureIndex) ?? failed.at(0);

  return (
    <section className="flex h-[40%] min-h-40 shrink-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border bg-card @4xl:h-full @4xl:w-[34%]">
      <div
        role="tablist"
        aria-label={t('outputPanes')}
        className="flex shrink-0 gap-1 overflow-x-auto border-b p-1.5"
      >
        {tabs.map(({ value, label, icon: Icon }, index) => (
          <button
            key={value}
            id={`${id}-${value}`}
            type="button"
            role="tab"
            aria-controls={`${id}-panel`}
            aria-selected={value === tab}
            tabIndex={value === tab ? 0 : -1}
            onClick={() => onTab(value)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              const target = tabs[next]!.value;
              onTab(target);
              event.currentTarget.ownerDocument
                .getElementById(`${id}-${target}`)
                ?.focus();
            }}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 font-semibold text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-accent aria-selected:text-accent-foreground motion-reduce:transition-none"
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
            {value === 'tests' && !!test?.cases.length && (
              <span
                className={cn(
                  'rounded-full px-1 text-[10px]',
                  failed.length
                    ? 'bg-calendar-bg-red text-dynamic-red'
                    : 'bg-calendar-bg-green text-dynamic-green'
                )}
              >
                {failed.length
                  ? t('testFailedCount', { count: failed.length })
                  : t('testPassedCount', { count: test.cases.length })}
              </span>
            )}
          </button>
        ))}
      </div>
      {runner && (
        <div className="shrink-0 border-b p-2">
          <WorkbenchRunnerUnavailable {...runner} />
        </div>
      )}
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${tab}`}
        className="flex min-h-0 flex-1 flex-col overflow-auto"
      >
        {tab === 'tests' ? (
          <div className="space-y-2 p-2.5">
            {testing ? (
              <p role="status" className="text-muted-foreground text-xs">
                {t('running')}
              </p>
            ) : test?.cases.length ? (
              <>
                <ul className="space-y-1">
                  {test.cases.map((item) => {
                    const Icon = item.passed ? Check : X;
                    const tone = item.passed
                      ? 'text-dynamic-green'
                      : 'text-dynamic-red';
                    const name = t('testCase', { index: item.index + 1 });
                    return (
                      <li key={item.index}>
                        {item.passed ? (
                          <div
                            className={`flex items-center gap-2 rounded-[var(--radius)] bg-calendar-bg-green px-2 py-1 font-mono text-xs ${tone}`}
                          >
                            <Icon
                              className="size-3.5"
                              aria-label={t('testPassed')}
                            />
                            {name}
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-pressed={selectedFailure?.index === item.index}
                            aria-label={`${name}, ${t('testFailed')}`}
                            onClick={() => onSelectFailure?.(item.index)}
                            className={`flex w-full items-center gap-2 rounded-[var(--radius)] bg-calendar-bg-red px-2 py-1 text-left font-mono text-xs aria-pressed:ring-1 aria-pressed:ring-current ${tone}`}
                          >
                            <Icon className="size-3.5" aria-hidden="true" />
                            {name}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {selectedFailure && (
                  <pre className="overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius)] border bg-muted/40 p-2 font-mono text-xs">
                    {[selectedFailure.stderr, selectedFailure.output]
                      .filter(Boolean)
                      .join('\n') || t('testFailed')}
                  </pre>
                )}
                {failureLink &&
                  selectedFailure?.index === failureLink.index && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-auto max-w-full whitespace-normal rounded-full bg-calendar-bg-purple text-dynamic-purple"
                      onClick={failureLink.jump}
                    >
                      <Sparkles className="size-3.5" />
                      {t('miraLinkedFailure', { line: failureLink.line })}
                    </Button>
                  )}
              </>
            ) : (
              <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs">
                {test?.output || t(canTest ? 'testsEmpty' : 'testsUnavailable')}
              </p>
            )}
            {output.failure && (
              <WorkbenchFailureNotice
                failure={output.failure}
                onRetry={output.onRetry}
                retrying={output.retrying}
              />
            )}
          </div>
        ) : tab === 'preview' && !preview ? (
          <div className="m-auto flex max-w-64 flex-col items-center gap-2 p-4 text-center">
            <Globe
              aria-hidden="true"
              className="size-5 text-muted-foreground"
            />
            <p className="text-muted-foreground text-xs">
              {t('webPreviewUnavailable')}
            </p>
          </div>
        ) : (
          <WorkbenchOutput
            {...output}
            run={tab === 'console' ? output.run : undefined}
            preview={tab === 'preview' ? preview : undefined}
            open
            onToggle={() => undefined}
            embedded
          />
        )}
      </div>
      {checkpoint && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t bg-muted/25 px-2 py-1.5">
          <span className="flex items-center gap-1 font-semibold text-xs">
            <Bookmark className="size-3.5" />
            {t('checkpoints')}
          </span>
          {checkpoint.state !== 'idle' && (
            <span
              role={checkpoint.state === 'failed' ? 'alert' : 'status'}
              className={
                checkpoint.state === 'failed'
                  ? 'text-destructive text-xs'
                  : 'text-muted-foreground text-xs'
              }
            >
              {t(
                checkpoint.state === 'saved'
                  ? canTest
                    ? 'checkpointSaved'
                    : 'saved'
                  : 'checkpointFailed'
              )}
            </span>
          )}
          <Button
            className="ml-auto h-7 rounded-full"
            variant="outline"
            size="sm"
            disabled={checkpoint.pending}
            onClick={checkpoint.save}
          >
            {t('checkpointSave')}
          </Button>
        </div>
      )}
    </section>
  );
}
