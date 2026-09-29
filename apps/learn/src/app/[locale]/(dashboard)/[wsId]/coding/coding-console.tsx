'use client';

import { useTranslations } from 'next-intl';
import type { CodingExecutionSummary } from '@/lib/coding/results';

export type ConsoleTab = 'cases' | 'result' | 'history';

function formatDuration(value: number | null) {
  if (value === null) return '—';
  return value < 1 ? '<1 ms' : `${value} ms`;
}

export function CodingConsole({
  activeExecution,
  customExpected,
  customInput,
  executions,
  hasMore,
  historyLoading,
  onCustomExpectedChange,
  onCustomInputChange,
  onLoadMore,
  onRestore,
  onSelectExecution,
  publicCases,
  selectedId,
  setTab,
  tab,
}: {
  activeExecution: CodingExecutionSummary | null;
  customExpected: string;
  customInput: string;
  executions: CodingExecutionSummary[];
  hasMore: boolean;
  historyLoading: boolean;
  onCustomExpectedChange: (value: string) => void;
  onCustomInputChange: (value: string) => void;
  onLoadMore: () => void;
  onRestore: (execution: CodingExecutionSummary) => void;
  onSelectExecution: (id: string) => void;
  publicCases: { input: string; output: string }[];
  selectedId: string | null;
  setTab: (tab: ConsoleTab) => void;
  tab: ConsoleTab;
}) {
  const t = useTranslations('coding');
  return (
    <section
      aria-label={t('console')}
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <div className="flex shrink-0 items-center gap-1 border-b px-3 py-1.5">
        {(['cases', 'result', 'history'] as const).map((entry) => (
          <button
            aria-selected={tab === entry}
            className={`rounded-md px-3 py-1.5 font-medium text-xs transition-colors ${
              tab === entry
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            key={entry}
            onClick={() => setTab(entry)}
            role="tab"
            type="button"
          >
            {t(`tabs.${entry}`)}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {tab === 'cases' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {publicCases.map((testCase, index) => (
              <div className="rounded-lg border p-3" key={testCase.input}>
                <p className="mb-3 font-medium text-sm">
                  {t('publicCase', { number: index + 1 })}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-muted-foreground text-xs">
                      {t('input')}
                    </p>
                    <pre className="max-h-28 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs">
                      {testCase.input}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-muted-foreground text-xs">
                      {t('expectedOutput')}
                    </p>
                    <pre className="max-h-28 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs">
                      {testCase.output}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-lg border p-3 xl:col-span-2">
              <p className="mb-1 font-medium text-sm">{t('customCase')}</p>
              <p className="mb-3 text-muted-foreground text-xs">
                {t('customCaseHint')}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-muted-foreground text-xs">
                  {t('input')}
                  <textarea
                    className="min-h-24 resize-y rounded-md border bg-background p-2 font-mono text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    maxLength={4096}
                    onChange={(event) =>
                      onCustomInputChange(event.target.value)
                    }
                    spellCheck={false}
                    value={customInput}
                  />
                </label>
                <label className="grid gap-1 text-muted-foreground text-xs">
                  {t('expectedOutput')}
                  <textarea
                    className="min-h-24 resize-y rounded-md border bg-background p-2 font-mono text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    maxLength={4096}
                    onChange={(event) =>
                      onCustomExpectedChange(event.target.value)
                    }
                    spellCheck={false}
                    value={customExpected}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}
        {tab === 'result' ? (
          activeExecution ? (
            <div aria-live="polite" className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-semibold text-base">
                  {activeExecution.result
                    ? t('passed', {
                        passed: activeExecution.result.passed,
                        total: activeExecution.result.total,
                      })
                    : t(`status.${activeExecution.status}`)}
                </h3>
                <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground text-xs">
                  {t(`kinds.${activeExecution.kind}`)}
                </span>
                {activeExecution.result?.medianDurationMs !== null &&
                activeExecution.result?.medianDurationMs !== undefined ? (
                  <span className="font-mono text-muted-foreground text-xs">
                    {t('medianTime')}:{' '}
                    {formatDuration(activeExecution.result.medianDurationMs)}
                  </span>
                ) : null}
              </div>
              {activeExecution.result ? (
                <>
                  <p className="text-muted-foreground text-xs">
                    {t('hiddenSummary', {
                      passed: activeExecution.result.hiddenPassed,
                      total: activeExecution.result.hiddenTotal,
                    })}
                  </p>
                  {activeExecution.result.timingRangeMs ? (
                    <p className="text-muted-foreground text-xs">
                      {t('timeRange', {
                        min: formatDuration(
                          activeExecution.result.timingRangeMs[0]
                        ),
                        max: formatDuration(
                          activeExecution.result.timingRangeMs[1]
                        ),
                      })}{' '}
                      {t('timingNote')}
                    </p>
                  ) : null}
                  <div className="grid gap-2">
                    {activeExecution.result.results.map((testCase) => (
                      <div
                        className="rounded-lg border p-3 text-sm"
                        key={testCase.index}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">
                            {testCase.visible
                              ? t('publicCase', {
                                  number: testCase.index + 1,
                                })
                              : t('hiddenCase', {
                                  number: testCase.index + 1,
                                })}
                          </span>
                          <span
                            className={
                              testCase.passed
                                ? 'text-primary'
                                : 'text-destructive'
                            }
                          >
                            {testCase.passed
                              ? t('result.passed')
                              : t(`result.${testCase.reason}`)}
                          </span>
                        </div>
                        {testCase.visible ? (
                          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                            <span className="text-muted-foreground">
                              {t('caseTime')}:{' '}
                              {formatDuration(testCase.durationMs)}
                            </span>
                            {testCase.output !== undefined ? (
                              <div className="sm:col-span-2">
                                <p className="mb-1 text-muted-foreground">
                                  {t('actualOutput')}
                                </p>
                                <pre className="max-h-32 overflow-auto rounded-md bg-muted/60 p-2 font-mono">
                                  {testCase.output || t('emptyOutput')}
                                </pre>
                              </div>
                            ) : null}
                            {testCase.stderr ? (
                              <pre className="max-h-32 overflow-auto rounded-md bg-muted/60 p-2 font-mono sm:col-span-2">
                                {testCase.stderr}
                              </pre>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t('noResult')}</p>
          )
        ) : null}
        {tab === 'history' ? (
          <div className="space-y-2">
            {executions.length ? (
              executions.map((execution) => (
                <div
                  className={`rounded-lg border p-3 ${
                    selectedId === execution.id ? 'border-primary' : ''
                  }`}
                  key={execution.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      className="text-left font-medium text-sm hover:underline"
                      onClick={() => {
                        onSelectExecution(execution.id);
                        setTab('result');
                      }}
                      type="button"
                    >
                      {t(`kinds.${execution.kind}`)} ·{' '}
                      {execution.language
                        ? t(`languages.${execution.language}`)
                        : t('unknownLanguage')}{' '}
                      ·{' '}
                      {execution.result
                        ? t('passed', {
                            passed: execution.result.passed,
                            total: execution.result.total,
                          })
                        : t(`status.${execution.status}`)}
                    </button>
                    <button
                      className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                      onClick={() => onRestore(execution)}
                      type="button"
                    >
                      {t('restoreCode')}
                    </button>
                  </div>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {new Date(execution.createdAt).toLocaleString()} ·{' '}
                    {t('medianTime')}:{' '}
                    {formatDuration(execution.result?.medianDurationMs ?? null)}
                  </p>
                  {selectedId === execution.id ? (
                    <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs">
                      {execution.source}
                    </pre>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                {historyLoading ? t('loadingHistory') : t('emptyHistory')}
              </p>
            )}
            {hasMore ? (
              <button
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                disabled={historyLoading}
                onClick={onLoadMore}
                type="button"
              >
                {t('loadMore')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
