'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MousePointer2, Play, Save, Square, Users } from '@tuturuuu/icons';
import {
  checkpointHostedPlayground,
  getHostedPlaygroundRun,
  hostedPlaygroundPreviewUrl,
  joinHostedPlayground,
  type ProgrammingCollaborationJoin,
  runHostedPlayground,
  shareHostedPlayground,
} from '@tuturuuu/internal-api/playgrounds';
import { replaceProgrammingText } from '@tuturuuu/realtime';
import type { PlaygroundExecutionResult } from '@tuturuuu/types/primitives/playgrounds';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as Y from 'yjs';
import { ProgrammingEditor } from './programming-editor';
import { useProgrammingRoom } from './use-programming-room';

export function ProgrammingWorkbench({
  projectId,
  roomKey = projectId,
  join,
  checkpoint,
  execution,
  previewUrl,
  problem,
  onTest,
}: {
  projectId: string;
  roomKey?: string;
  join?: () => Promise<ProgrammingCollaborationJoin>;
  checkpoint?: () => Promise<unknown>;
  previewUrl?: (port: number) => string;
  execution?: {
    run: (payload: {
      operation: 'run' | 'stop';
      requestId: string;
      stdin?: string;
    }) => Promise<{ runId: string }>;
    read: (runId: string) => Promise<PlaygroundExecutionResult>;
  };
  problem?: { title: string; prompt: string };
  onTest?: (source: string) => Promise<string>;
}) {
  const t = useTranslations('programmingPlayground');
  const room = useProgrammingRoom(
    roomKey,
    join ?? (() => joinHostedPlayground(projectId))
  );
  const [selected, setSelected] = useState('');
  const [newPath, setNewPath] = useState('');
  const [invite, setInvite] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [stdin, setStdin] = useState('');
  const [port, setPort] = useState('3000');
  const [preview, setPreview] = useState(false);
  const [testOutput, setTestOutput] = useState('');
  const project = room.ticket.data?.project;
  const owner = room.ticket.data?.role === 'owner';
  const canExecute =
    owner || (!!execution && room.ticket.data?.role === 'editor');
  const editable =
    room.status === 'open' && room.ticket.data?.role !== 'viewer';
  const active =
    room.snapshot.files.find((file) => file.path === selected) ??
    room.snapshot.files[0];
  const result = useQuery({
    queryKey: ['playground-run', roomKey, runId],
    queryFn: () =>
      execution
        ? execution.read(runId!)
        : getHostedPlaygroundRun(projectId, runId!),
    enabled: !!runId && !problem,
    refetchInterval: (query) =>
      ['queued', 'running', 'cancel_requested'].includes(
        query.state.data?.status ?? 'queued'
      )
        ? 300
        : false,
    retry: false,
  });
  const busy =
    result.data &&
    ['queued', 'running', 'cancel_requested'].includes(result.data.status);
  const checkpointRoom =
    checkpoint ?? (() => checkpointHostedPlayground(projectId));
  const save = useMutation({ mutationFn: checkpointRoom });
  const run = useMutation({
    mutationFn: async (operation: 'run' | 'stop') => {
      if (operation === 'run' && canExecute) await checkpointRoom();
      const payload = { operation, requestId: crypto.randomUUID(), stdin };
      const queued = execution
        ? await execution.run(payload)
        : await runHostedPlayground(projectId, payload);
      setRunId(queued.runId);
    },
  });
  const test = useMutation({
    mutationFn: async () => {
      if (active && onTest) setTestOutput(await onTest(active.content));
    },
  });
  const share = useMutation({
    mutationFn: (role: 'editor' | null) =>
      shareHostedPlayground(projectId, { userId: invite.trim(), role }),
  });
  const addFile = () => {
    if (
      !/^[a-zA-Z0-9_.@+-]+(?:\/[a-zA-Z0-9_.@+-]+)*$/.test(newPath) ||
      newPath.split('/').some((part) => part === '..' || part === '.') ||
      room.snapshot.files.some((file) => file.path === newPath)
    )
      return;
    room.client!.doc.getMap<Y.Text>('files').set(newPath, new Y.Text());
    setSelected(newPath);
    setNewPath('');
  };
  if (room.ticket.isError)
    return (
      <p role="alert" className="p-6 text-muted-foreground">
        {t('accessError')}
      </p>
    );
  if (!project || !room.client)
    return (
      <p role="status" className="p-6">
        {t('connecting')}
      </p>
    );
  return (
    <section className="flex h-full min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-xl border bg-background">
      <style>{`.programming-remote-selection{background:color-mix(in srgb,var(--primary) 20%,transparent)}.programming-remote-caret{border-left:2px solid var(--primary)}.programming-remote-label{background:var(--primary);color:var(--primary-foreground);font-size:10px;border-radius:3px}`}</style>
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <strong className="mr-auto truncate text-sm">
          {problem?.title ?? project.name}
        </strong>
        <span role="status" className="text-muted-foreground text-xs">
          {t(room.status)}
        </span>
        <span
          className="flex items-center gap-1 text-xs"
          title={room.presence.map((person) => person.displayName).join(', ')}
        >
          <Users className="size-3" />
          {room.presence.length}
        </span>
        {!problem && canExecute && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={save.isPending || !editable || !!busy}
              onClick={() => save.mutate()}
            >
              <Save className="size-3" />
              {t('save')}
            </Button>
            <Button
              size="sm"
              disabled={run.isPending || !editable || !!busy}
              onClick={() => run.mutate('run')}
            >
              <Play className="size-3" />
              {t('run')}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('stop')}
              disabled={run.isPending || !editable}
              onClick={() => run.mutate('stop')}
            >
              <Square className="size-3" />
            </Button>
            {owner && !execution && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    {t('share')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('share')}</DialogTitle>
                  </DialogHeader>
                  <Label htmlFor="programming-invite">{t('accountId')}</Label>
                  <Input
                    id="programming-invite"
                    value={invite}
                    onChange={(event) => setInvite(event.target.value)}
                  />
                  <Button
                    disabled={share.isPending}
                    onClick={() => share.mutate('editor')}
                  >
                    {t('invite')}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={share.isPending}
                    onClick={() => share.mutate(null)}
                  >
                    {t('revoke')}
                  </Button>
                  {share.isError && <p role="alert">{t('failed')}</p>}
                  {share.isSuccess && <p role="status">{t('shared')}</p>}
                </DialogContent>
              </Dialog>
            )}
          </>
        )}
        {problem && onTest && (
          <Button
            size="sm"
            disabled={!editable || test.isPending}
            onClick={() => test.mutate()}
          >
            {t('test')}
          </Button>
        )}
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[12rem_1fr]">
        <aside className="space-y-2 border-b p-3 lg:border-r lg:border-b-0">
          {problem && (
            <div className="max-h-48 overflow-auto whitespace-pre-wrap text-sm">
              {problem.prompt}
            </div>
          )}
          <p className="text-muted-foreground text-xs">{t('files')}</p>
          <div className="flex flex-wrap gap-1 lg:flex-col">
            {room.snapshot.files.map((file) => (
              <Button
                key={file.path}
                size="sm"
                variant={active?.path === file.path ? 'secondary' : 'ghost'}
                className="justify-start truncate"
                onClick={() => setSelected(file.path)}
              >
                {file.path}
              </Button>
            ))}
          </div>
          {!problem && (
            <>
              <Input
                aria-label={t('newFile')}
                value={newPath}
                onChange={(event) => setNewPath(event.target.value)}
                disabled={!editable}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!editable || !newPath}
                onClick={addFile}
              >
                {t('addFile')}
              </Button>
            </>
          )}
          {!problem && (
            <p className="text-muted-foreground text-xs">{t('driveHint')}</p>
          )}
        </aside>
        <div
          className="relative min-h-[20rem] min-w-0"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            room.client!.presence({
              file: active?.path ?? null,
              pointer: {
                x: Math.max(
                  0,
                  Math.min(1, (event.clientX - box.left) / box.width)
                ),
                y: Math.max(
                  0,
                  Math.min(1, (event.clientY - box.top) / box.height)
                ),
              },
            });
          }}
          onPointerLeave={() =>
            room.client!.presence({ file: active?.path ?? null, pointer: null })
          }
        >
          {active && (
            <ProgrammingEditor
              path={`${roomKey}/${active.path}`}
              language={project.language}
              value={active.content}
              readOnly={!editable}
              onChange={(value) => {
                const text = room
                  .client!.doc.getMap<Y.Text>('files')
                  .get(active.path);
                if (text) replaceProgrammingText(text, value);
              }}
              presence={room.presence
                .filter((person) => person.userId !== room.ticket.data?.actorId)
                .map((person) => ({
                  ...person,
                  file: person.file ? `${roomKey}/${person.file}` : null,
                }))}
              onSelection={(selection) =>
                room.client!.presence({ file: active.path, selection })
              }
              onCursor={(line, column) =>
                room.client!.presence({
                  file: active.path,
                  cursor: { line, column },
                })
              }
            />
          )}
          {room.presence
            .filter(
              (person) =>
                person.userId !== room.ticket.data?.actorId &&
                person.pointer &&
                person.file === active?.path
            )
            .map((person) => (
              <div
                key={person.connectionId}
                className="pointer-events-none absolute z-20 flex gap-1 text-primary text-xs"
                style={{
                  left: `${person.pointer!.x * 100}%`,
                  top: `${person.pointer!.y * 100}%`,
                }}
              >
                <MousePointer2 className="size-4" />
                {person.displayName}
              </div>
            ))}
        </div>
      </div>
      {!problem && (
        <div className="grid gap-2 border-t p-3 sm:grid-cols-[1fr_15rem]">
          <Label className="space-y-1">
            {t('command')}
            <Input
              value={room.snapshot.command}
              disabled={!editable}
              onChange={(event) =>
                replaceProgrammingText(
                  room.client!.doc.getText('command'),
                  event.target.value
                )
              }
            />
          </Label>
          <Label className="space-y-1">
            {t('stdin')}
            <Textarea
              className="h-9 min-h-9 font-mono"
              value={stdin}
              onChange={(event) => setStdin(event.target.value)}
            />
          </Label>
        </div>
      )}
      <div className="border-t bg-muted/20 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <strong>{t('console')}</strong>
          <span role="status" className="mr-auto text-muted-foreground">
            {busy
              ? t('running')
              : room.saveError
                ? t('saveFailed')
                : room.savedRevision !== null
                  ? t('saved')
                  : t('backgroundSave')}
          </span>
          {!problem && canExecute && (
            <>
              <Input
                className="h-7 w-20"
                aria-label={t('previewPort')}
                value={port}
                onChange={(event) => setPort(event.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPreview(!preview)}
              >
                {t('preview')}
              </Button>
            </>
          )}
        </div>
        <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
          {problem ? testOutput : result.data?.output}
        </pre>
        {(run.isError || save.isError || test.isError || result.isError) && (
          <p role="alert" className="text-sm">
            {t('failed')}
          </p>
        )}
        {preview && Number(port) >= 1024 && Number(port) <= 65535 && (
          <iframe
            title={t('preview')}
            sandbox="allow-scripts allow-forms"
            referrerPolicy="no-referrer"
            src={
              previewUrl
                ? previewUrl(Number(port))
                : hostedPlaygroundPreviewUrl(projectId, Number(port))
            }
            className="mt-3 h-80 w-full rounded border bg-background"
          />
        )}
      </div>
    </section>
  );
}
