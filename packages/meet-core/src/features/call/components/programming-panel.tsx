'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkpointMeetProgramming,
  createMeetPlayground,
  getMeetPlaygroundRun,
  getMeetProgramming,
  getMeetProgrammingTest,
  type MeetingProgrammingJoin,
  runMeetPlayground,
  selectMeetProgramming,
  testMeetProgramming,
} from '@tuturuuu/internal-api';
import { meetingAppPath } from '@tuturuuu/meet-core/runtime';
import type { MeetingProgramming } from '@tuturuuu/realtime/meet';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
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
  api?: typeof meetingProgrammingApi;
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
    mutationFn: () =>
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
  const active = query.data?.selection
    ? (query.data as MeetingProgrammingJoin)
    : null;
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
        return result.output ?? result.status;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Programming test timed out');
  }
  const showSetup = canManage && (!active || setupOpen);
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {showSetup && (
        <ProgrammingSetup
          wsId={wsId}
          accountId={accountId}
          kind={kind}
          id={id}
          language={language}
          pending={select.isPending || create.isPending}
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
      )}
      {(query.isError || select.isError || create.isError) && (
        <p role="alert" className="px-3 text-destructive text-sm">
          {t('accessError')}
        </p>
      )}
      {active ? (
        <div className="min-h-0 flex-1">
          <Workbench
            key={`${accountId ?? 'native'}:${meetingId}:${active.selection.id}:${active.selection.language}`}
            projectId={active.project.id}
            roomKey={`meeting:${meetingId}:${active.selection.id}:${active.selection.language}`}
            join={join}
            checkpoint={() => api.checkpoint(meetingId)}
            previewUrl={
              previewUrl ??
              ((port) =>
                meetingAppPath(
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
            onTest={active.problem ? test : undefined}
            actions={
              canManage
                ? [
                    {
                      id: 'change-resource',
                      label: t('changeResource'),
                      onSelect: () => setSetupOpen((value) => !value),
                    },
                    {
                      id: 'close-room',
                      label: t('close'),
                      destructive: true,
                      disabled: select.isPending,
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
