'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@tuturuuu/ui/resizable';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { listCodingChallenges } from '@/lib/coding/challenges';
import {
  CODING_LANGUAGES,
  type CodingLanguage,
  starterCode,
} from '@/lib/coding/languages';
import type {
  CodingExecutionKind,
  CodingExecutionSummary,
} from '@/lib/coding/results';
import {
  getCodingSubmission,
  listCodingExecutions,
  submitCodingSolution,
} from './actions';
import { CodingConsole, type ConsoleTab } from './coding-console';
import { CodingProblem } from './coding-problem';

const CodingEditor = dynamic(
  () => import('./coding-editor').then((module) => module.CodingEditor),
  {
    loading: () => <div className="h-full animate-pulse bg-muted/30" />,
    ssr: false,
  }
);

type PublicChallenge = ReturnType<typeof listCodingChallenges>[number];
type CodingHistoryPage = Awaited<ReturnType<typeof listCodingExecutions>>;
type Attempt = {
  challenge: string;
  customCase?: { input: string; expected: string };
  kind: CodingExecutionKind;
  language: CodingLanguage;
  source: string;
};

function subscribeToWidth(callback: () => void) {
  const media = window.matchMedia('(min-width: 1024px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

function useWideLayout() {
  return useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia('(min-width: 1024px)').matches,
    () => true
  );
}

export function CodingLab({
  availableLanguages,
  challenges,
  readOnly,
  studentId,
  wsId,
}: {
  availableLanguages: CodingLanguage[];
  challenges: PublicChallenge[];
  readOnly: boolean;
  studentId?: string;
  wsId: string;
}) {
  const t = useTranslations('coding');
  const wide = useWideLayout();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(challenges[0]?.slug ?? '');
  const [language, setLanguage] = useState<CodingLanguage>(
    availableLanguages[0] ?? 'python'
  );
  const challenge = challenges.find((entry) => entry.slug === selected);
  const [source, setSource] = useState(
    starterCode(availableLanguages[0] ?? 'python', challenge?.starterCode ?? '')
  );
  const drafts = useRef(new Map<string, string>());
  const [customInput, setCustomInput] = useState('');
  const [customExpected, setCustomExpected] = useState('');
  const [diagnostics, setDiagnostics] = useState(0);
  const [tab, setTab] = useState<ConsoleTab>('cases');
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<Attempt | null>(null);
  const historyKey = ['coding-executions', wsId, studentId, selected];

  const submit = useMutation({
    mutationFn: (attempt: Attempt) =>
      submitCodingSolution(
        wsId,
        studentId,
        attempt.challenge,
        attempt.language,
        attempt.source,
        attempt.kind,
        attempt.customCase
      ),
    onSuccess: (id, attempt) => {
      setLastAttempt(attempt);
      setSubmissionId(id);
      setInspectedId(null);
      setTab('result');
      void queryClient.invalidateQueries({ queryKey: historyKey });
    },
  });
  const submission = useQuery({
    enabled: Boolean(submissionId),
    queryFn: () => getCodingSubmission(wsId, studentId, submissionId!),
    queryKey: ['coding-execution', wsId, studentId, submissionId],
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' || !status
        ? 1500
        : false;
    },
  });
  const history = useInfiniteQuery({
    enabled: Boolean(selected),
    getNextPageParam: (lastPage: CodingHistoryPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }): Promise<CodingHistoryPage> =>
      listCodingExecutions(
        wsId,
        studentId,
        selected,
        typeof pageParam === 'string' ? pageParam : undefined
      ),
    queryKey: historyKey,
    refetchInterval:
      submission.data?.status === 'queued' ||
      submission.data?.status === 'running'
        ? 3000
        : false,
  });
  const executions = useMemo(
    () =>
      history.data?.pages.flatMap((page: CodingHistoryPage) => page.items) ??
      [],
    [history.data]
  );
  const optimisticExecution: CodingExecutionSummary | null =
    submissionId && lastAttempt
      ? {
          challengeSlug: lastAttempt.challenge,
          createdAt: new Date().toISOString(),
          id: submissionId,
          kind: lastAttempt.kind,
          language: lastAttempt.language,
          result: null,
          source: lastAttempt.source,
          status: 'queued',
        }
      : null;
  const activeExecution = inspectedId
    ? (executions.find((entry) => entry.id === inspectedId) ?? null)
    : (submission.data ?? optimisticExecution);
  const judgeReady = availableLanguages.includes(language);
  const isBusy =
    submit.isPending ||
    submission.data?.status === 'queued' ||
    submission.data?.status === 'running';

  function draftKey(challengeSlug: string, nextLanguage: CodingLanguage) {
    return `${challengeSlug}:${nextLanguage}`;
  }

  function openDraft(
    nextChallenge: PublicChallenge,
    nextLanguage: CodingLanguage
  ) {
    setSource(
      drafts.current.get(draftKey(nextChallenge.slug, nextLanguage)) ??
        starterCode(nextLanguage, nextChallenge.starterCode)
    );
    setSubmissionId(null);
    setInspectedId(null);
    setDiagnostics(0);
    setTab('cases');
    submit.reset();
  }

  function selectChallenge(slug: string) {
    const next = challenges.find((entry) => entry.slug === slug);
    if (!next) return;
    setSelected(slug);
    openDraft(next, language);
  }

  function selectLanguage(next: CodingLanguage) {
    setLanguage(next);
    if (challenge) openDraft(challenge, next);
  }

  function editSource(next: string) {
    drafts.current.set(draftKey(selected, language), next);
    setSource(next);
  }

  function execute(kind: CodingExecutionKind) {
    if (readOnly || !judgeReady || isBusy || !source.trim() || !challenge)
      return;
    const customCase =
      kind === 'test' && customInput.trim()
        ? { input: customInput, expected: customExpected }
        : undefined;
    setInspectedId(null);
    submit.mutate({ challenge: selected, customCase, kind, language, source });
  }

  function restoreCode(execution: CodingExecutionSummary) {
    if (execution.language) setLanguage(execution.language);
    const nextLanguage = execution.language ?? language;
    drafts.current.set(draftKey(selected, nextLanguage), execution.source);
    setSource(execution.source);
    setInspectedId(execution.id);
    setTab('result');
  }

  if (!challenge) return null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-background text-foreground shadow-sm">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <label className="min-w-36 flex-1 sm:max-w-64">
          <span className="sr-only">{t('challengeList')}</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 font-medium text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => selectChallenge(event.target.value)}
            value={selected}
          >
            {challenges.map((entry) => (
              <option key={entry.slug} value={entry.slug}>
                {t(`challenges.${entry.slug}.title`)}
              </option>
            ))}
          </select>
        </label>
        <span className="hidden rounded-md bg-muted px-2 py-1 text-muted-foreground text-xs sm:inline-flex">
          {t(`topics.${challenge.topic}`)} ·{' '}
          {t(`difficulty.${challenge.difficulty}`)}
        </span>
        <span className="flex-1" />
        <label>
          <span className="sr-only">{t('language')}</span>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) =>
              selectLanguage(event.target.value as CodingLanguage)
            }
            value={language}
          >
            {CODING_LANGUAGES.map((entry) => (
              <option key={entry} value={entry}>
                {t(`languages.${entry}`)}
                {availableLanguages.includes(entry) ? '' : ` · ${t('offline')}`}
              </option>
            ))}
          </select>
        </label>
        <button
          className="h-9 rounded-md border px-3 font-medium text-sm hover:bg-accent disabled:opacity-50"
          disabled={readOnly || !judgeReady || isBusy || !source.trim()}
          onClick={() => execute('test')}
          type="button"
        >
          {t('runTests')}
        </button>
        <button
          className="h-9 rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm disabled:opacity-50"
          disabled={readOnly || !judgeReady || isBusy || !source.trim()}
          onClick={() => execute('submit')}
          type="button"
        >
          {submit.isPending ? t('submitting') : t('submit')}
        </button>
      </header>

      <ResizablePanelGroup
        className="min-h-0 flex-1"
        direction={wide ? 'horizontal' : 'vertical'}
        key={wide ? 'wide' : 'narrow'}
      >
        <ResizablePanel
          defaultSize={wide ? 40 : 28}
          id="coding-problem"
          minSize={wide ? 25 : 15}
        >
          <CodingProblem challenge={challenge} />
        </ResizablePanel>
        <ResizableHandle aria-label={t('resizeProblem')} withHandle />
        <ResizablePanel
          defaultSize={wide ? 60 : 72}
          id="coding-workspace"
          minSize={wide ? 35 : 50}
        >
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={62} id="coding-editor" minSize={25}>
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex shrink-0 items-center justify-between border-b px-3 py-2 text-xs">
                  <span className="font-medium">{t('editor')}</span>
                  <span className="text-muted-foreground">
                    {language === 'javascript' || language === 'typescript'
                      ? t('localChecks', { count: diagnostics })
                      : t('syntaxHighlighting')}
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  <CodingEditor
                    challenge={selected}
                    language={language}
                    onChange={editSource}
                    onDiagnostics={setDiagnostics}
                    onRun={() => execute('test')}
                    source={source}
                  />
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle aria-label={t('resizeConsole')} withHandle />
            <ResizablePanel defaultSize={38} id="coding-console" minSize={20}>
              <CodingConsole
                activeExecution={activeExecution}
                customExpected={customExpected}
                customInput={customInput}
                executions={executions}
                hasMore={Boolean(history.hasNextPage)}
                historyLoading={history.isFetching}
                onCustomExpectedChange={setCustomExpected}
                onCustomInputChange={setCustomInput}
                onLoadMore={() => void history.fetchNextPage()}
                onRestore={restoreCode}
                onSelectExecution={setInspectedId}
                publicCases={challenge.publicCases}
                selectedId={inspectedId ?? submissionId}
                setTab={setTab}
                tab={tab}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
      {readOnly || !judgeReady || submit.error || submission.error ? (
        <p
          className="shrink-0 border-t px-3 py-1.5 text-destructive text-xs"
          role="alert"
        >
          {readOnly
            ? t('parentReadOnly')
            : !judgeReady
              ? t('judgeUnavailable')
              : (submit.error?.message ?? submission.error?.message)}
        </p>
      ) : null}
    </div>
  );
}
