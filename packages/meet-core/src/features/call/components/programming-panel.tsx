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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ProgrammingResourcePicker } from './programming-resource-picker';

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
  const locale = useLocale();
  const cache = useQueryClient();
  const [kind, setKind] = useState<'problem' | 'playground'>('playground');
  const [id, setId] = useState('');
  const [language, setLanguage] =
    useState<(typeof PLAYGROUND_LANGUAGES)[number]>('python');
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
    onSuccess: () => cache.invalidateQueries({ queryKey: key }),
  });
  const create = useMutation({
    mutationFn: () =>
      api.create(meetingId, {
        name: t('playground'),
        empty: true,
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
        <div className="flex flex-wrap items-end gap-2 bg-background px-3 py-2">
          <div className="min-w-32 space-y-1">
            <Label>{t('resource')}</Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                setKind(value as typeof kind);
                setId('');
                if (value === 'problem' && language === 'shell')
                  setLanguage('python');
              }}
            >
              <SelectTrigger aria-label={t('resource')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="playground">{t('playground')}</SelectItem>
                <SelectItem value="problem">{t('problem')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {wsId && accountId ? (
            <ProgrammingResourcePicker
              wsId={wsId}
              accountId={accountId}
              kind={kind}
              id={id}
              onSelect={(value, projectLanguage) => {
                setId(value);
                if (projectLanguage) setLanguage(projectLanguage);
              }}
            />
          ) : (
            <Input
              value={id}
              onChange={(event) => setId(event.target.value)}
              aria-label={t('resourceId')}
              placeholder={t('resourceId')}
              className="min-w-48 flex-1"
            />
          )}
          <div className="min-w-32 space-y-1">
            <Label>{t('language')}</Label>
            <Select
              value={language}
              onValueChange={(value) => setLanguage(value as typeof language)}
            >
              <SelectTrigger aria-label={t('language')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYGROUND_LANGUAGES.filter(
                  (l) => kind === 'playground' || l !== 'shell'
                ).map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            key={`${accountId ?? 'native'}:${meetingId}:${active.selection.id}:${active.selection.language}`}
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
        <p role="status" className="p-6 text-muted-foreground">
          {t(preparing || query.isPending ? 'connecting' : 'chooseResource')}
        </p>
      )}
    </div>
  );
}
