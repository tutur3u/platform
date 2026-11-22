'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { meetBrowserPath } from '@tuturuuu/utils/meet-url';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { MiraMark } from './mira-mark';
import { ProgrammingEmptyState } from './programming-empty-state';
import { PROGRAMMING_LANGUAGE_LABELS } from './programming-languages';
import {
  forgetRoomPlayground,
  readRoomPlaygrounds,
  rememberRoomPlayground,
} from './programming-room-playgrounds';
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
  // Hosts land in the open dialog when nothing is open yet.
  const [setupOpen, setSetupOpen] = useState(canManage && !selection);
  // Survives the workbench remount on a language switch, so a runner that
  // refused a run keeps Run disabled for the rest of the call.
  const [runnerUnavailable, setRunnerUnavailable] = useState(false);
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
  // A new playground starts from the language's template, so switching the
  // runtime also switches the starter code.
  const createPlayground = async (next: ProgrammingLanguage) => {
    const project = await api.create(meetingId, {
      name: t('meetingPlaygroundName', {
        language: PROGRAMMING_LANGUAGE_LABELS[next],
      }),
      empty: false,
      language: next,
    });
    await api.select(meetingId, {
      kind: 'playground',
      id: project.id,
      language: next,
    });
    rememberRoomPlayground(meetingId, next, project.id);
    return project;
  };
  // Switching back to a language reopens the playground this room already
  // used for it, with its code, instead of adding another project.
  const switchPlayground = async (
    from: MeetingProgramming,
    next: ProgrammingLanguage
  ) => {
    rememberRoomPlayground(meetingId, from.language, from.id);
    const known = readRoomPlaygrounds(meetingId)[next];
    if (known) {
      try {
        return await api.select(meetingId, {
          kind: 'playground',
          id: known,
          language: next,
        });
      } catch (error) {
        // Only a playground the service says is gone or no longer matches is
        // replaced. A passing failure keeps the mapping so a retry reopens it.
        const status =
          error instanceof InternalApiError ? error.status : undefined;
        if (status !== 400 && status !== 404 && status !== 409) throw error;
        forgetRoomPlayground(meetingId, next);
      }
    }
    return createPlayground(next);
  };
  const create = useMutation({
    mutationFn: () => createPlayground(language),
    onSuccess: async (project) => {
      setId(project.id);
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
    mutationFn: (next: {
      from: MeetingProgramming;
      language: ProgrammingLanguage;
    }) =>
      next.from.kind === 'problem'
        ? api.select(meetingId, { ...next.from, language: next.language })
        : switchPlayground(next.from, next.language),
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
  const runtimeSelection =
    canManage && active?.role === 'owner' ? active.selection : null;
  const pending =
    select.isPending || create.isPending || switchRuntime.isPending;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 wrap-anywhere">
      {canManage && (
        <ProgrammingSetup
          open={setupOpen}
          onOpenChange={setSetupOpen}
          wsId={wsId}
          accountId={accountId}
          kind={kind}
          id={id}
          language={language}
          languageLocked={kind === 'playground' && !!id}
          pending={pending}
          failed={select.isError || create.isError}
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
        />
      )}
      {query.isError && (
        <p role="alert" className="px-3 text-destructive text-sm">
          {t('accessError')}
        </p>
      )}
      {switchRuntime.isError && (
        <p role="alert" className="px-3 text-destructive text-sm">
          {t('switchFailed')}
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
              onRuntime: runtimeSelection
                ? (next) => {
                    if (next !== runtimeSelection.language && !pending)
                      switchRuntime.mutate({
                        from: runtimeSelection,
                        language: next,
                      });
                  }
                : undefined,
              runtimePending: switchRuntime.isPending,
              runnerUnavailable,
              onRunnerUnavailable: setRunnerUnavailable,
            }}
            actions={
              canManage
                ? [
                    {
                      id: 'change-resource',
                      label: t('changeResource'),
                      disabled: switchRuntime.isPending,
                      onSelect: () => setSetupOpen(true),
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
        <ProgrammingEmptyState
          canManage={canManage}
          waiting={preparing || query.isPending}
          onOpen={() => setSetupOpen(true)}
        />
      )}
    </div>
  );
}
