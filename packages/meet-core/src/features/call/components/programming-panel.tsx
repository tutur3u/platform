'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CodeXml } from '@tuturuuu/icons';
import {
  checkpointMeetProgramming,
  createMeetPlayground,
  getMeetPlaygroundRun,
  getMeetProgramming,
  getMeetProgrammingMira,
  getMeetProgrammingTest,
  InternalApiError,
  type MeetProgrammingMiraAction,
  runMeetPlayground,
  selectMeetProgramming,
  testMeetProgramming,
  updateMeetProgrammingMira,
} from '@tuturuuu/internal-api';
import type { MeetingProgramming } from '@tuturuuu/realtime/meet';
import { PLAYGROUND_LANGUAGES } from '@tuturuuu/types/primitives/playgrounds';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { meetBrowserPath } from '@tuturuuu/utils/meet-url';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { MiraMark } from './mira-mark';
import {
  type ProgrammingKind,
  type ProgrammingLanguage,
  ProgrammingSetup,
} from './programming-setup';

const Workbench = dynamic(
  () => import('@tuturuuu/programming-ui').then((m) => m.ProgrammingWorkbench),
  { ssr: false }
);
export const meetingProgrammingApi = {
  read: getMeetProgramming,
  select: selectMeetProgramming,
  create: createMeetPlayground,
  run: runMeetPlayground,
  readRun: getMeetPlaygroundRun,
  test: testMeetProgramming,
  readTest: getMeetProgrammingTest,
  checkpoint: checkpointMeetProgramming,
  readMira: getMeetProgrammingMira,
  changeMira: updateMeetProgrammingMira,
};
const ACTIVE_TEST = ['queued', 'running', 'cancel_requested'];
const problemLanguages = PLAYGROUND_LANGUAGES.filter(
  (language) => language !== 'shell'
);
const languageLabel: Record<ProgrammingLanguage, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  rust: 'Rust',
  go: 'Go',
  ruby: 'Ruby',
  php: 'PHP',
  shell: 'Shell',
};

export function ProgrammingPanel({
  meetingId,
  wsId,
  accountId,
  preparing = false,
  canManage,
  selection,
  api = meetingProgrammingApi,
  previewUrl,
}: {
  meetingId: string;
  wsId?: string;
  accountId?: string;
  preparing?: boolean;
  canManage: boolean;
  selection: MeetingProgramming | null;
  api?: Omit<typeof meetingProgrammingApi, 'readMira' | 'changeMira'> &
    Partial<Pick<typeof meetingProgrammingApi, 'readMira' | 'changeMira'>>;
  previewUrl?: (port: number) => string;
}) {
  const t = useTranslations('programmingPlayground');
  const locale = useLocale() === 'vi' ? 'vi' : 'en';
  const cache = useQueryClient();
  const [kind, setKind] = useState<ProgrammingKind>('playground');
  const [id, setId] = useState('');
  const [language, setLanguage] = useState<ProgrammingLanguage>('python');
  const [setupOpen, setSetupOpen] = useState(false);
  const key = [
    'meet-programming',
    meetingId,
    accountId,
    selection?.id,
    selection?.language,
  ];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.read(meetingId),
    refetchInterval: 45000,
    retry: false,
  });
  const select = useMutation({
    mutationFn: (clear: boolean) =>
      api.select(meetingId, clear ? null : { kind, id, language }),
    onSuccess: () => {
      setSetupOpen(false);
      return cache.invalidateQueries({ queryKey: key });
    },
  });
  const create = useMutation({
    mutationFn: (): Promise<{ id: string }> =>
      api.create(meetingId, { name: t('playground'), empty: true, language }),
    onSuccess: async (project) => {
      setId(project.id);
      await api.select(meetingId, {
        kind: 'playground',
        id: project.id,
        language,
      });
      setSetupOpen(false);
      void cache.invalidateQueries({ queryKey: key });
    },
  });
  const active = query.data?.selection ? query.data : null;
  const readMira = api.readMira;
  const changeMira = api.changeMira;
  const miraKey = [
    ...key,
    'mira',
    active?.selection.id,
    active?.selection.language,
  ];
  const mira = useQuery({
    queryKey: miraKey,
    queryFn: () => readMira!(meetingId),
    enabled: !!active && !!readMira,
    refetchInterval: (query) => (query.state.data?.voiceDraft ? 3000 : 12000),
    refetchIntervalInBackground: false,
    retry: false,
  });
  const miraAction = useMutation({
    mutationFn: (action: MeetProgrammingMiraAction) =>
      changeMira!(meetingId, active!.selection, action),
    onSettled: () => cache.invalidateQueries({ queryKey: miraKey }),
  });
  const switchRuntime = useMutation({
    mutationFn: (selection: MeetingProgramming) =>
      api.select(meetingId, selection),
    onSuccess: () => cache.invalidateQueries({ queryKey: key }),
  });
  const miraError = miraAction.error;
  const miraCode =
    miraError && 'code' in miraError ? miraError.code : undefined;
  const miraErrorState =
    miraError && miraError instanceof InternalApiError
      ? miraCode === 'MIRA_CONSENT_REQUIRED'
        ? 'consent'
        : miraCode === 'MIRA_LIVE_REQUIRED'
          ? 'live'
          : 'status' in miraError &&
              miraError.status === 409 &&
              miraAction.variables?.action === 'resolve'
            ? 'conflict'
            : 'unavailable'
      : miraError
        ? 'unavailable'
        : undefined;
  const miraSelection = mira.data?.selection;
  const miraMatches =
    miraSelection?.id === active?.selection.id &&
    miraSelection?.kind === active?.selection.kind &&
    miraSelection?.language === active?.selection.language;
  async function join() {
    const data = await api.read(meetingId);
    if (!data.selection) throw new Error('Programming unavailable');
    return data;
  }
  async function test(source: string) {
    const queued = await api.test(meetingId, source);
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const result = await api.readTest(meetingId, queued.id);
      if (!ACTIVE_TEST.includes(result.status))
        return {
          submissionId: queued.id,
          output:
            result.output ??
            (result.status === 'succeeded' ? '' : t('testRunFailed')),
          cases: result.cases ?? [],
        };
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Programming test timed out');
  }
  const showSetup = canManage && (!active || setupOpen);
  const problemSelection =
    canManage && active?.role === 'owner' && active.selection.kind === 'problem'
      ? active.selection
      : null;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 wrap-anywhere">
      {showSetup && (
        <div className="max-h-full min-w-0 overflow-y-auto [&_input]:min-w-0">
          <ProgrammingSetup
            wsId={wsId}
            accountId={accountId}
            kind={kind}
            id={id}
            language={language}
            pending={
              select.isPending || create.isPending || switchRuntime.isPending
            }
            onKind={(value) => {
              setKind(value);
              setId('');
              if (value === 'problem' && language === 'shell')
                setLanguage('python');
            }}
            onId={(value, projectLanguage) => {
              setId(value);
              if (projectLanguage) setLanguage(projectLanguage);
            }}
            onLanguage={setLanguage}
            onOpen={() => select.mutate(false)}
            onCreate={() => create.mutate()}
            onDismiss={active ? () => setSetupOpen(false) : undefined}
          />
        </div>
      )}
      {problemSelection && !showSetup && (
        <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 px-2 pt-1">
          <Select
            value={problemSelection.language}
            disabled={select.isPending || switchRuntime.isPending}
            onValueChange={(value) => {
              const language = problemLanguages.find((item) => item === value);
              if (language && language !== problemSelection.language)
                switchRuntime.mutate({ ...problemSelection, language });
            }}
          >
            <SelectTrigger
              aria-label={t('language')}
              className="h-8 w-auto max-w-full gap-2"
            >
              <CodeXml aria-hidden="true" className="size-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {problemLanguages.map((value) => (
                <SelectItem key={value} value={value}>
                  {languageLabel[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {(query.isError ||
        select.isError ||
        create.isError ||
        switchRuntime.isError) && (
        <p role="alert" className="px-3 text-destructive text-sm">
          {t('accessError')}
        </p>
      )}
      {active ? (
        <div className="min-h-0 min-w-0 flex-1">
          <Workbench
            key={`${accountId ?? 'native'}:${meetingId}:${active.selection.id}:${active.selection.language}`}
            projectId={active.project.id}
            roomKey={`meeting:${meetingId}:${active.selection.id}:${active.selection.language}`}
            join={join}
            checkpoint={() => api.checkpoint(meetingId)}
            previewUrl={
              previewUrl ??
              ((port) =>
                meetBrowserPath(
                  `/api/meet-call/${encodeURIComponent(meetingId)}/programming/preview/${port}/`
                ))
            }
            execution={{
              run: (payload) => api.run(meetingId, payload),
              read: (runId) => api.readRun(meetingId, runId),
            }}
            problem={
              active.problem
                ? {
                    title: active.problem.title[locale],
                    prompt: active.problem.prompt[locale],
                  }
                : undefined
            }
            meeting={{
              mira: {
                presence:
                  miraMatches && !mira.isError
                    ? (mira.data?.miraPresence ?? null)
                    : null,
                voiceDraft:
                  miraMatches && !mira.isError ? mira.data?.voiceDraft : null,
                manage: canManage && !!changeMira && active.role === 'owner',
                pending: miraAction.isPending,
                error: miraErrorState,
                mark: <MiraMark size={16} />,
                onAction: (action) => miraAction.mutate(action),
              },
              runTests: active.problem ? test : undefined,
            }}
            actions={
              canManage
                ? [
                    {
                      id: 'change-resource',
                      label: t('changeResource'),
                      disabled: switchRuntime.isPending,
                      onSelect: () => setSetupOpen((value) => !value),
                    },
                    {
                      id: 'close-room',
                      label: t('close'),
                      destructive: true,
                      disabled: select.isPending || switchRuntime.isPending,
                      onSelect: () => select.mutate(true),
                    },
                  ]
                : []
            }
          />
        </div>
      ) : (
        !canManage && (
          <p
            role="status"
            className="m-auto px-6 text-center text-muted-foreground text-sm"
          >
            {t(preparing || query.isPending ? 'connecting' : 'chooseResource')}
          </p>
        )
      )}
    </div>
  );
}
