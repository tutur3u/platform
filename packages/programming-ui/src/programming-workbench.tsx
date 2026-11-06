'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  checkpointHostedPlayground,
  getHostedPlaygroundRun,
  hostedPlaygroundPreviewUrl,
  joinHostedPlayground,
  type ProgrammingCollaborationJoin,
  runHostedPlayground,
} from '@tuturuuu/internal-api/playgrounds';
import { replaceProgrammingText } from '@tuturuuu/realtime';
import type { PlaygroundExecutionResult } from '@tuturuuu/types/primitives/playgrounds';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as Y from 'yjs';
import { useProgrammingRoom } from './use-programming-room';
import { WorkbenchEditorStage } from './workbench-editor-stage';
import { WorkbenchFiles } from './workbench-files';
import {
  isRunActive,
  outputView,
  saveState,
  type WorkbenchAction,
} from './workbench-layout';
import { WorkbenchOutput } from './workbench-output';
import { workbenchPermissions } from './workbench-permissions';
import { WorkbenchShareDialog } from './workbench-share-dialog';
import { WorkbenchToolbar } from './workbench-toolbar';

export type { WorkbenchAction } from './workbench-layout';

export function ProgrammingWorkbench({
  projectId,
  roomKey = projectId,
  join,
  checkpoint,
  execution,
  previewUrl,
  problem,
  onTest,
  actions = [],
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
  /** Host-owned entries for the overflow menu, e.g. changing or closing the meeting resource. */
  actions?: WorkbenchAction[];
}) {
  const t = useTranslations('programmingPlayground');
  const room = useProgrammingRoom(
    roomKey,
    join ?? (() => joinHostedPlayground(projectId))
  );
  const [selected, setSelected] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [stdin, setStdin] = useState('');
  const [port, setPort] = useState('3000');
  const [preview, setPreview] = useState(false);
  const [outputOpen, setOutputOpen] = useState(true);
  const [promptOpen, setPromptOpen] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [testOutput, setTestOutput] = useState('');
  const project = room.ticket.data?.project;
  const { owner, canExecute, editable } = workbenchPermissions(
    room.ticket.data?.role,
    room.status,
    !!execution
  );
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
      isRunActive(query.state.data?.status ?? 'queued') ? 300 : false,
    retry: false,
  });
  const busy = isRunActive(result.data?.status);
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
      setOutputOpen(true);
    },
  });
  const test = useMutation({
    mutationFn: async () => {
      if (active && onTest) setTestOutput(await onTest(active.content));
      setOutputOpen(true);
    },
  });
  if (room.ticket.isError)
    return (
      <p role="alert" className="p-6 text-muted-foreground text-sm">
        {t('accessError')}
      </p>
    );
  if (!project || !room.client)
    return (
      <p role="status" className="p-6 text-muted-foreground text-sm">
        {t('connecting')}
      </p>
    );
  const menu: WorkbenchAction[] = [
    ...(problem
      ? [
          {
            id: 'prompt',
            label: t(promptOpen ? 'hideProblem' : 'showProblem'),
            onSelect: () => setPromptOpen((value) => !value),
          },
        ]
      : []),
    ...(!problem && canExecute
      ? [
          {
            id: 'preview',
            label: t(preview ? 'previewClose' : 'preview'),
            onSelect: () => {
              setPreview((value) => !value);
              setOutputOpen(true);
            },
          },
        ]
      : []),
    ...(owner && !execution && !problem
      ? [{ id: 'share', label: t('share'), onSelect: () => setShareOpen(true) }]
      : []),
    ...actions,
  ];
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-background">
      <WorkbenchToolbar
        title={problem?.title ?? project.name}
        language={project.language}
        status={room.status}
        participants={room.presence.map((person) => person.displayName)}
        controls={
          problem
            ? onTest
              ? {
                  kind: 'problem',
                  editable,
                  pending: test.isPending,
                  onTest: () => test.mutate(),
                }
              : { kind: 'none' }
            : canExecute
              ? {
                  kind: 'playground',
                  editable,
                  busy,
                  pending: run.isPending || save.isPending,
                  onRun: () => run.mutate('run'),
                  onStop: () => run.mutate('stop'),
                  onSave: () => save.mutate(),
                }
              : { kind: 'none' }
        }
        actions={menu}
      />
      {problem && promptOpen && (
        <div className="max-h-40 shrink-0 overflow-auto whitespace-pre-wrap border-b bg-muted/20 px-3 py-2 text-sm">
          {problem.prompt}
        </div>
      )}
      <WorkbenchFiles
        files={room.snapshot.files.map((file) => file.path)}
        active={active?.path}
        onSelect={setSelected}
        onAdd={
          !problem && editable
            ? (path) => {
                room
                  .client!.doc.getMap<Y.Text>('files')
                  .set(path, new Y.Text());
                setSelected(path);
              }
            : undefined
        }
      />
      <WorkbenchEditorStage
        roomKey={roomKey}
        file={active}
        language={project.language}
        editable={editable}
        client={room.client}
        presence={room.presence}
        actorId={room.ticket.data?.actorId}
      />
      <WorkbenchOutput
        open={outputOpen}
        onToggle={() => setOutputOpen((value) => !value)}
        view={outputView(!!problem, testOutput, result.data)}
        save={saveState(room.saveError, room.savedRevision)}
        failed={run.isError || save.isError || test.isError || result.isError}
        run={
          problem
            ? undefined
            : {
                command: room.snapshot.command,
                onCommand: (value) =>
                  replaceProgrammingText(
                    room.client!.doc.getText('command'),
                    value
                  ),
                stdin,
                onStdin: setStdin,
                editable,
              }
        }
        preview={
          preview && canExecute && !problem
            ? {
                port,
                onPort: setPort,
                url: (value) =>
                  previewUrl
                    ? previewUrl(value)
                    : hostedPlaygroundPreviewUrl(projectId, value),
                onClose: () => setPreview(false),
              }
            : undefined
        }
      />
      {owner && !execution && !problem && (
        <WorkbenchShareDialog
          projectId={projectId}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}
    </section>
  );
}
