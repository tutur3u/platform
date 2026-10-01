'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  usePanelRef,
} from '@tuturuuu/ui/resizable';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { listCodingChallenges } from '@/lib/coding/challenges';
import { type CodingLanguage, starterCode } from '@/lib/coding/languages';
import type {
  CodingExecutionKind,
  CodingExecutionSummary,
} from '@/lib/coding/results';
import type { ProgrammingDraftScope } from '@/lib/programming/drafts';
import { useProgrammingDraft } from '@/lib/programming/use-draft';
import {
  getCodingSubmission,
  listCodingExecutions,
  submitCodingSolution,
} from './actions';
import { CodingConsole, type ConsoleTab } from './coding-console';
import { programmingFont } from './coding-font';
import { CodingProblem } from './coding-problem';
import { CodingToolbar } from './coding-toolbar';

const CodingEditor = dynamic(
  () => import('./coding-editor').then((module) => module.CodingEditor),
  {
    loading: () => <div className="h-full animate-pulse bg-muted/30" />,
    ssr: false,
  }
);

type PublicChallenge = ReturnType<typeof listCodingChallenges>[number] & {
  title?: string;
  prompt?: string;
};
type CodingHistoryPage = Awaited<ReturnType<typeof listCodingExecutions>>;
export type CodingAttempt = {
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
  initialSelected,
  onNavigate,
  draftScope,
  api,
  challenges,
  readOnly,
  studentId,
  wsId,
}: {
  availableLanguages: CodingLanguage[];
  initialSelected?: string;
  onNavigate?: (id: string) => void;
  draftScope?: ProgrammingDraftScope;
  api?: {
    submit: (attempt: CodingAttempt) => Promise<string>;
    get: (id: string) => Promise<CodingExecutionSummary | null>;
    list: (id: string, before?: string) => Promise<CodingHistoryPage>;
  };
  challenges: PublicChallenge[];
  readOnly: boolean;
  studentId?: string;
  wsId: string;
}) {
  const t = useTranslations('coding');
  const wide = useWideLayout();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(
    initialSelected ?? challenges[0]?.slug ?? ''
  );
  const [localLanguage, setLocalLanguage] = useState<CodingLanguage>(
    availableLanguages[0] ?? 'python'
  );
  const challenge = challenges.find((entry) => entry.slug === selected);
  const [localSource, setLocalSource] = useState(
    starterCode(availableLanguages[0] ?? 'python', challenge?.starterCode ?? '')
  );
  const drafts = useRef(new Map<string, string>());
  const [localCustomInput, setLocalCustomInput] = useState('');
  const [localCustomExpected, setLocalCustomExpected] = useState('');
  const [diagnostics, setDiagnostics] = useState(0);
  const consolePanel = usePanelRef();
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  const [localTab, setLocalTab] = useState<ConsoleTab>('cases');
  const [localSubmissionId, setLocalSubmissionId] = useState<string | null>(
    null
  );
  const [localInspectedId, setLocalInspectedId] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<CodingAttempt | null>(null);
  const persisted = useProgrammingDraft(
    draftScope,
    availableLanguages[0] ?? 'python'
  );
  const tab = draftScope ? persisted.draft.tab : localTab;
  const language = draftScope ? persisted.draft.language : localLanguage;
  const source = draftScope
    ? (persisted.draft.sources[language] ??
      starterCode(language, challenge?.starterCode ?? ''))
    : localSource;
  const customInput = draftScope
    ? persisted.draft.customInput
    : localCustomInput;
  const customExpected = draftScope
    ? persisted.draft.customExpected
    : localCustomExpected;
  const submissionId = draftScope
    ? persisted.draft.submissionId
    : localSubmissionId;
  const inspectedId = draftScope
    ? persisted.draft.inspectedId
    : localInspectedId;
  function setTab(next: ConsoleTab) {
    if (draftScope)
      persisted.update((previous) => ({ ...previous, tab: next }));
    else setLocalTab(next);
  }
  function setLanguage(next: CodingLanguage) {
    if (draftScope)
      persisted.update((previous) => ({ ...previous, language: next }));
    else setLocalLanguage(next);
  }
  function setSource(next: string, nextLanguage = language) {
    if (draftScope)
      persisted.update((previous) => ({
        ...previous,
        sources: { ...previous.sources, [nextLanguage]: next },
      }));
    else setLocalSource(next);
  }
  function setCustomInput(next: string) {
    if (draftScope)
      persisted.update((previous) => ({ ...previous, customInput: next }));
    else setLocalCustomInput(next);
  }
  function setCustomExpected(next: string) {
    if (draftScope)
      persisted.update((previous) => ({ ...previous, customExpected: next }));
    else setLocalCustomExpected(next);
  }
  function setSubmissionId(next: string | null) {
    if (draftScope)
      persisted.update((previous) => ({ ...previous, submissionId: next }));
    else setLocalSubmissionId(next);
  }
  function setInspectedId(next: string | null) {
    if (draftScope)
      persisted.update((previous) => ({ ...previous, inspectedId: next }));
    else setLocalInspectedId(next);
  }
  const historyKey = [
    'coding-executions',
    draftScope?.actorId,
    wsId,
    draftScope?.learnerId ?? studentId,
    selected,
  ];

  const submit = useMutation({
    mutationFn: (attempt: CodingAttempt) =>
      api
        ? api.submit(attempt)
        : submitCodingSolution(
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
      consolePanel.current?.expand();
      void queryClient.invalidateQueries({ queryKey: historyKey });
    },
  });
  const submission = useQuery({
    enabled: Boolean(submissionId),
    queryFn: () =>
      api
        ? api.get(submissionId!)
        : getCodingSubmission(wsId, studentId, submissionId!),
    queryKey: [
      'coding-execution',
      draftScope?.actorId,
      wsId,
      draftScope?.learnerId ?? studentId,
      selected,
      submissionId,
    ],
    refetchInterval: (query) => {
      if (query.state.data === null) return false;
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
      api
        ? api.list(
            selected,
            typeof pageParam === 'string' ? pageParam : undefined
          )
        : listCodingExecutions(
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
      (draftScope
        ? persisted.draft.sources[nextLanguage]
        : drafts.current.get(draftKey(nextChallenge.slug, nextLanguage))) ??
        starterCode(nextLanguage, nextChallenge.starterCode),
      nextLanguage
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
    if (onNavigate) {
      onNavigate(slug);
      return;
    }
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
    setSource(execution.source, nextLanguage);
    setInspectedId(execution.id);
    setTab('result');
  }

  if (!challenge) return null;

  return (
    <div
      className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground ${programmingFont.variable} [--font-mono:var(--font-programming-mono)]`}
    >
      <CodingToolbar
        availableLanguages={availableLanguages}
        challenge={challenge}
        challenges={challenges}
        disabled={readOnly || !judgeReady || isBusy || !source.trim()}
        language={language}
        onSubmit={() => execute('submit')}
        onTest={() => execute('test')}
        selected={selected}
        selectChallenge={selectChallenge}
        selectLanguage={selectLanguage}
        submitting={submit.isPending}
      />

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
                  <div className="flex min-w-0 items-center gap-2">
                    {language === 'javascript' || language === 'typescript' ? (
                      <span className="hidden text-muted-foreground sm:inline">
                        {t('localChecks', { count: diagnostics })}
                      </span>
                    ) : null}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-controls="programming-console"
                          aria-expanded={!consoleCollapsed}
                          aria-label={t(
                            consoleCollapsed
                              ? 'expandConsole'
                              : 'collapseConsole'
                          )}
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() =>
                            consoleCollapsed
                              ? consolePanel.current?.expand()
                              : consolePanel.current?.collapse()
                          }
                        >
                          {consoleCollapsed ? (
                            <ChevronUp className="size-4" aria-hidden="true" />
                          ) : (
                            <ChevronDown
                              className="size-4"
                              aria-hidden="true"
                            />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t(
                          consoleCollapsed ? 'expandConsole' : 'collapseConsole'
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  <CodingEditor
                    challenge={
                      draftScope
                        ? `${draftScope.actorId}/${wsId}/${draftScope.learnerId}/${selected}`
                        : selected
                    }
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
            <ResizablePanel
              defaultSize={consoleCollapsed ? 0 : 38}
              id="coding-console"
              minSize={20}
              collapsible
              collapsedSize={0}
              panelRef={consolePanel}
              onResize={(size) => setConsoleCollapsed(size.asPercentage === 0)}
            >
              <div
                id="programming-console"
                className="h-full min-h-0"
                inert={consoleCollapsed}
              >
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
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
      {readOnly || !judgeReady || submit.error || submission.error ? (
        <p
          className="shrink-0 border-t bg-muted px-3 py-2 text-foreground text-xs"
          role={submit.error || submission.error ? 'alert' : 'status'}
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
