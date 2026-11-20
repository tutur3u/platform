'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import {
  readTurnstileScriptNonce,
  SAFARI_SAFE_TURNSTILE_OPTIONS,
} from '@tuturuuu/cloudflare/turnstile/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { MAX_DISPLAY_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { useLocale } from 'next-intl';
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { FormsResultsPanel } from '../forms-results/forms-results-panel';
import { ResizableCallPanel } from '../resizable-call-panel';
import {
  type MeetFormLaunch,
  meetFormResultsCsv,
  readMeetFormResults,
  readMeetForms,
  requestMeetFormPrefill,
  submitMeetForm,
  summarizeMeetForm,
} from './meet-forms-client';
import { useMeetFormsCopy } from './meet-forms-copy';
import { MeetFormsLaunchTools } from './meet-forms-launch-tools';
import { MeetFormsPanel } from './meet-forms-panel';
import { MeetFormsSheet } from './meet-forms-sheet';
import type {
  MeetFormsAnswers,
  MeetFormsPanelProps,
  MeetFormsResult,
  MeetFormsState,
} from './types';

const smallViewport = '(max-width: 767px)';
const mobileSnapshot = () => matchMedia(smallViewport).matches;
function subscribeViewport(onChange: () => void) {
  const query = matchMedia(smallViewport);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

type Draft = { answers: MeetFormsAnswers; prefillIds: readonly string[] };
const emptyDraft: Draft = { answers: {}, prefillIds: [] };

export function MeetFormsActivity({
  meetingId,
  accountId,
  canManage,
  canReadWorkspace,
  turnstileSiteKey,
  open,
  onClose,
}: {
  meetingId: string;
  accountId: string;
  canManage: boolean;
  canReadWorkspace: boolean;
  turnstileSiteKey?: string;
  open: boolean;
  onClose: () => void;
}) {
  const locale = useLocale().startsWith('vi') ? 'vi' : 'en';
  const copy = useMeetFormsCopy();
  const mobile = useSyncExternalStore(
    subscribeViewport,
    mobileSnapshot,
    () => false
  );
  const [selectedId, setSelectedId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [view, setView] = useState<'respond' | 'results'>('respond');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [receipts, setReceipts] = useState<Record<string, MeetFormsResult>>({});
  const [token, setToken] = useState<{ cData: string; value: string }>();
  const [resetKey, setResetKey] = useState(0);
  const [failedChallenge, setFailedChallenge] = useState<string>();
  const submissions = useRef(new Map<string, { input: string; id: string }>());
  const client = useQueryClient();
  const guestNameId = useId();
  const launchesKey = ['meet-call-forms', meetingId, accountId] as const;
  const query = useQuery({
    queryKey: launchesKey,
    queryFn: ({ signal }) => readMeetForms(meetingId, signal),
    enabled: open,
    refetchInterval: 5_000,
    retry: false,
    gcTime: 0,
  });
  const choices = query.data?.launches ?? [];
  const launch =
    choices.find((item) => item.launchId === selectedId) ?? choices.at(-1);
  const launchId = launch?.launchId ?? '';
  const draft = drafts[launchId] ?? emptyDraft;
  const result = receipts[launchId] ?? null;
  const state: MeetFormsState = query.isError
    ? { kind: 'error', onRetry: () => void query.refetch() }
    : launch
      ? {
          kind: launch.submissionPolicy.acceptingResponses ? 'open' : 'closed',
          form: {
            ...launch.form,
            launchId: launch.launchId,
            versionId: launch.versionId,
          },
        }
      : { kind: query.isPending ? 'loading' : 'empty' };

  function choose(nextId: string) {
    setSelectedId(nextId);
    setView('respond');
    setGuestName('');
    setToken(undefined);
    setFailedChallenge(undefined);
  }

  function updateDraft(update: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [launchId]: { ...(current[launchId] ?? emptyDraft), ...update },
    }));
  }

  const challenge = launch?.turnstile;
  const proof =
    challenge && token && token.cData === challenge.cData
      ? token.value
      : undefined;
  const requiresProof = launch?.submissionPolicy.requireTurnstile ?? false;
  const namedLaunch = Boolean(
    launch && launch.submissionPolicy.accessMode !== 'anonymous'
  );
  useEffect(() => {
    if (!open) {
      setToken(undefined);
      setFailedChallenge(undefined);
    }
  }, [open]);
  const panel: MeetFormsPanelProps = {
    state,
    answers: draft.answers,
    onAnswersChange: (answers) => updateDraft({ answers }),
    prefilledQuestionIds: draft.prefillIds,
    onPrefilledQuestionIdsChange: (prefillIds) => updateDraft({ prefillIds }),
    result,
    onPrefill:
      launch && namedLaunch && (canReadWorkspace || guestName.trim())
        ? async (binding) => {
            const questionIds = launch.form.sections
              .flatMap((section) =>
                section.questions.map((question) => question.id)
              )
              .slice(0, 120);
            return (
              await requestMeetFormPrefill(
                meetingId,
                binding,
                questionIds,
                canReadWorkspace ? undefined : guestName.trim()
              )
            ).answers;
          }
        : undefined,
    onSubmit: async (submission) => {
      if (requiresProof && !proof)
        throw new Error(copy.verificationUnavailable);
      const input = JSON.stringify(
        Object.entries(submission.answers).sort(([a], [b]) =>
          a.localeCompare(b)
        )
      );
      const previous = submissions.current.get(submission.launchId);
      const id = previous?.input === input ? previous.id : crypto.randomUUID();
      submissions.current.set(submission.launchId, { input, id });
      try {
        const next = await submitMeetForm(meetingId, {
          ...submission,
          submissionId: id,
          turnstileToken: proof,
        });
        setReceipts((current) => ({ ...current, [next.launchId]: next }));
      } finally {
        setToken(undefined);
        setResetKey((key) => key + 1);
      }
    },
    submitBlocked: requiresProof && !proof,
    submissionControls: requiresProof ? (
      challenge && turnstileSiteKey ? (
        <>
          <Turnstile
            key={JSON.stringify([challenge.cData, resetKey])}
            siteKey={turnstileSiteKey}
            options={{
              ...SAFARI_SAFE_TURNSTILE_OPTIONS,
              size: 'flexible',
              action: challenge.action,
              cData: challenge.cData,
            }}
            scriptOptions={{ nonce: readTurnstileScriptNonce() }}
            onSuccess={(value) => {
              setFailedChallenge(undefined);
              setToken({ cData: challenge.cData, value });
            }}
            onExpire={() => setToken(undefined)}
            onError={() => {
              setToken(undefined);
              setFailedChallenge(challenge.cData);
            }}
          />
          {failedChallenge === challenge.cData && (
            <div className="space-y-2">
              <p role="alert" className="text-destructive text-sm">
                {copy.verificationUnavailable}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setFailedChallenge(undefined);
                  setResetKey((key) => key + 1);
                }}
              >
                {copy.retry}
              </Button>
            </div>
          )}
        </>
      ) : (
        <p role="alert" className="text-destructive text-sm">
          {copy.verificationUnavailable}
        </p>
      )
    ) : undefined,
  };
  const results = canManage && view === 'results' && launch;
  const controls = (
    <>
      {canManage && (
        <MeetFormsLaunchTools
          meetingId={meetingId}
          locale={locale}
          copy={copy}
          onLaunch={(next) => {
            client.setQueryData<{ launches: MeetFormLaunch[] }>(
              launchesKey,
              (current) => ({
                launches: [
                  ...(current?.launches ?? []).filter(
                    (item) => item.launchId !== next.launchId
                  ),
                  next,
                ],
              })
            );
            choose(next.launchId);
            void query.refetch();
          }}
        />
      )}
      {!canReadWorkspace && state.kind === 'open' && namedLaunch && !result && (
        <div className="space-y-1">
          <label htmlFor={guestNameId} className="text-sm">
            {copy.guestName}
          </label>
          <Input
            id={guestNameId}
            value={guestName}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            autoComplete="off"
            onChange={(event) => setGuestName(event.target.value)}
          />
        </div>
      )}
      {choices.length > 1 && (
        <Select value={launchId} onValueChange={choose}>
          <SelectTrigger className="w-full" aria-label={copy.openForm}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((item) => (
              <SelectItem key={item.launchId} value={item.launchId}>
                {item.form.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {canManage && launch && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={view === 'respond' ? 'secondary' : 'ghost'}
            aria-pressed={view === 'respond'}
            onClick={() => setView('respond')}
          >
            {copy.responseTab}
          </Button>
          <Button
            size="sm"
            variant={view === 'results' ? 'secondary' : 'ghost'}
            aria-pressed={view === 'results'}
            onClick={() => setView('results')}
          >
            {copy.resultsTab}
          </Button>
        </div>
      )}
      {results && (
        <FormsResultsPanel
          meetingId={meetingId}
          launchId={launchId}
          readResults={(signal) =>
            readMeetFormResults(meetingId, launchId, signal)
          }
          csvHref={meetFormResultsCsv(meetingId, launchId)}
          labels={{
            loading: copy.resultsLoading,
            error: copy.resultsError,
            retry: copy.retry,
            empty: copy.resultsEmpty,
            exportCsv: copy.resultsCsv,
            anonymous: copy.resultsAnonymous,
            named: copy.resultsNamed,
            responses: copy.resultsCount,
            answered: copy.resultsAnswered,
          }}
          summarize={{
            run: (requestId) =>
              summarizeMeetForm(meetingId, launchId, locale, requestId),
            label: copy.resultsMira,
            pending: copy.resultsMiraPending,
            unavailable: copy.resultsMiraError,
          }}
        />
      )}
    </>
  );
  if (!open) return null;
  if (mobile) {
    return (
      <MeetFormsSheet
        {...panel}
        open
        onOpenChange={(open) => !open && onClose()}
        precedingContent={controls}
        hideResponder={Boolean(results)}
      />
    );
  }
  return (
    <ResizableCallPanel label={copy.title}>
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="font-semibold">{copy.title}</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={copy.closePanel}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {controls}
        {!results && <MeetFormsPanel {...panel} />}
      </div>
    </ResizableCallPanel>
  );
}
