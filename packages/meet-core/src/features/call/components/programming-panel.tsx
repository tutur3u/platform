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
import type { MeetingProgramming } from '@tuturuuu/realtime/meet';
import { PLAYGROUND_LANGUAGES } from '@tuturuuu/types/primitives/playgrounds';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

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
export function ProgrammingPanel({
  meetingId,
  canManage,
  selection,
  api = meetingProgrammingApi,
  previewUrl,
}: {
  meetingId: string;
  canManage: boolean;
  selection: MeetingProgramming | null;
  api?: typeof meetingProgrammingApi;
  previewUrl?: (port: number) => string;
}) {
  const t = useTranslations('programmingPlayground');
  const locale = useLocale();
  const cache = useQueryClient();
  const [kind, setKind] = useState<'problem' | 'playground'>('problem');
  const [id, setId] = useState('');
  const [language, setLanguage] =
    useState<(typeof PLAYGROUND_LANGUAGES)[number]>('python');
  const key = [
    'meet-programming',
    meetingId,
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
    onSuccess: () => cache.invalidateQueries({ queryKey: key }),
  });
  const create = useMutation({
    mutationFn: () =>
      api.create(meetingId, {
        name: id.trim() || t('playground'),
        language,
      }),
    onSuccess: async (project) => {
      setId(project.id);
      await api.select(meetingId, {
        kind: 'playground',
        id: project.id,
        language,
      });
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
      if (!['queued', 'running', 'cancel_requested'].includes(result.status))
        return result.output ?? result.status;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Programming test timed out');
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {canManage && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-background p-3">
          <Label className="space-y-1">
            {t('resource')}
            <select
              className="block h-9 rounded border bg-background px-2"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="problem">{t('problem')}</option>
              <option value="playground">{t('playground')}</option>
            </select>
          </Label>
          <Label className="flex-1 space-y-1">
            {t('resourceId')}
            <Input value={id} onChange={(e) => setId(e.target.value)} />
          </Label>
          <Label className="space-y-1">
            {t('language')}
            <select
              className="block h-9 rounded border bg-background px-2"
              value={language}
              onChange={(e) => setLanguage(e.target.value as typeof language)}
            >
              {PLAYGROUND_LANGUAGES.filter(
                (l) => kind === 'playground' || l !== 'shell'
              ).map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Label>
          <Button
            disabled={!id || select.isPending}
            onClick={() => select.mutate(false)}
          >
            {t('open')}
          </Button>
          {kind === 'playground' && (
            <Button
              variant="outline"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              {t('create')}
            </Button>
          )}
          {active && (
            <Button
              variant="outline"
              disabled={select.isPending}
              onClick={() => select.mutate(true)}
            >
              {t('close')}
            </Button>
          )}
        </div>
      )}
      {(query.isError || select.isError || create.isError) && (
        <p role="alert">{t('accessError')}</p>
      )}
      {active ? (
        <div className="min-h-0 flex-1">
          <Workbench
            key={`${meetingId}:${active.selection.id}:${active.selection.language}`}
            projectId={active.project.id}
            roomKey={`meeting:${meetingId}:${active.selection.id}:${active.selection.language}`}
            join={join}
            checkpoint={() => api.checkpoint(meetingId)}
            previewUrl={
              previewUrl ??
              ((port) =>
                `/api/meet-call/${encodeURIComponent(meetingId)}/programming/preview/${port}/`)
            }
            execution={{
              run: (payload) => api.run(meetingId, payload),
              read: (runId) => api.readRun(meetingId, runId),
            }}
            problem={
              active.problem
                ? {
                    title: active.problem.title[locale === 'vi' ? 'vi' : 'en'],
                    prompt:
                      active.problem.prompt[locale === 'vi' ? 'vi' : 'en'],
                  }
                : undefined
            }
            onTest={active.problem ? test : undefined}
          />
        </div>
      ) : (
        <p className="p-6 text-muted-foreground">{t('chooseResource')}</p>
      )}
    </div>
  );
}
