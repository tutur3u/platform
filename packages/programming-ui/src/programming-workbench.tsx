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
import {
  type CollaborationPresence,
  replaceProgrammingText,
} from '@tuturuuu/realtime';
import type { PlaygroundExecutionResult } from '@tuturuuu/types/primitives/playgrounds';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { classNames as cn } from './class-names';
import {
  MiraCodeReview,
  MiraEditorBar,
  type WorkbenchMira,
} from './mira-code-presence';
import { useProgrammingRoom } from './use-programming-room';
import { WorkbenchEditorStage } from './workbench-editor-stage';
import { WorkbenchFiles, WorkbenchFileTree } from './workbench-files';
import {
  isRunActive,
  outputView,
  saveState,
  type WorkbenchAction,
} from './workbench-layout';
import {
  type OutputTab,
  WorkbenchMeetingOutput,
  type WorkbenchTestRun,
} from './workbench-meeting-output';
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
  meeting,
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
  meeting?: {
    mira: WorkbenchMira;
    runTests?: (source: string) => Promise<WorkbenchTestRun>;
    onRuntime?: (
      language: import('@tuturuuu/types/primitives/playgrounds').PlaygroundLanguage
    ) => void;
    runtimePending?: boolean;
  };
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
  const [outputTab, setOutputTab] = useState<OutputTab>(
    problem ? 'tests' : 'console'
  );
  const [cursor, setCursor] = useState<{
    path: string;
    selection: NonNullable<CollaborationPresence['selection']>;
  }>();
  const [jump, setJump] = useState<{
    path: string;
    line: number;
    request: number;
  }>();
  const [failure, setFailure] = useState<{ run: string; index: number }>();
  const project = room.ticket.data?.project;
  const { owner, canExecute, editable } = workbenchPermissions(
    room.ticket.data?.role,
    room.status,
    !!execution
  );
  const active =
    room.snapshot.files.find((file) => file.path === selected) ??
    room.snapshot.files[0];
  const activePath = active?.path;
  const collaborationClient = room.client;
  const collaborationOpen = room.status === 'open';
  useEffect(() => {
    if (collaborationClient && collaborationOpen && activePath) {
      collaborationClient.presence({
        file: activePath,
        selection: null,
        cursor: null,
        pointer: null,
      });
    }
  }, [activePath, collaborationClient, collaborationOpen]);
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
      setOutputTab('console');
      setOutputOpen(true);
    },
  });
  const test = useMutation({
    mutationFn: async (): Promise<WorkbenchTestRun | undefined> => {
      setOutputTab('tests');
      setOutputOpen(true);
      if (!active) return;
      if (meeting?.runTests) return meeting.runTests(active.content);
      if (onTest) setTestOutput(await onTest(active.content));
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
  const files = room.snapshot.files.map((file) => file.path);
  const collaborators = room.presence.filter(
    (person) => person.userId !== room.ticket.data?.actorId
  );
  const mira = meeting?.mira;
  const sharedPresence = mira?.presence;
  const miraFile =
    sharedPresence?.active || sharedPresence?.proposedFix?.status === 'proposed'
      ? sharedPresence?.filePath
      : undefined;
  const filePresence =
    sharedPresence && sharedPresence.filePath === active?.path
      ? sharedPresence
      : undefined;
  const tests = test.data;
  const failedCases = tests?.cases.filter((item) => !item.passed);
  const failedIndex =
    failure && failure.run === tests?.submissionId
      ? failure.index
      : failedCases?.[0]?.index;
  const linked = sharedPresence?.proposedFix;
  const failureLink =
    linked && linked.status !== 'dismissed' && tests
      ? failedCases?.find(
          (item) =>
            linked.linkedFailure === `${tests.submissionId}:${item.index}`
        )
      : undefined;
  const canCheckpoint = editable && (problem ? !!meeting && owner : canExecute);
  const selectedSave = save.isError
    ? 'failed'
    : saveState(room.saveError, room.savedRevision);
  const output = {
    view: outputView(!!problem, testOutput, result.data),
    save: selectedSave,
    failed: run.isError || save.isError || test.isError || result.isError,
    run: problem
      ? undefined
      : {
          command: room.snapshot.command,
          onCommand: (value: string) =>
            replaceProgrammingText(room.client!.doc.getText('command'), value),
          stdin,
          onStdin: setStdin,
          editable,
        },
  };
  const previewSettings =
    canExecute && !problem
      ? {
          port,
          onPort: setPort,
          url: (value: number) =>
            previewUrl?.(value) ?? hostedPlaygroundPreviewUrl(projectId, value),
          onClose: () =>
            meeting ? setOutputTab('console') : setPreview(false),
        }
      : undefined;
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
            label: t(
              (meeting ? outputTab === 'preview' : preview)
                ? 'previewClose'
                : 'preview'
            ),
            onSelect: () => {
              if (meeting)
                setOutputTab((value) =>
                  value === 'preview' ? 'console' : 'preview'
                );
              else setPreview((value) => !value);
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
    <section
      className={cn(
        '@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden border bg-background',
        meeting ? 'rounded-[var(--radius-2xl)]' : 'rounded-xl'
      )}
    >
      <WorkbenchToolbar
        title={problem?.title ?? project.name}
        language={project.language}
        status={room.status}
        participants={room.presence.map((person) => person.displayName)}
        meeting={
          meeting
            ? {
                mark: mira?.mark,
                onRuntime: meeting.onRuntime,
                runtimePending: meeting.runtimePending,
              }
            : undefined
        }
        controls={
          problem
            ? onTest || meeting?.runTests
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
      <div
        className={cn(
          'flex min-h-0 flex-1',
          meeting && 'flex-col gap-2 p-2 @4xl:flex-row'
        )}
      >
        {meeting && (
          <WorkbenchFileTree
            files={files}
            active={active?.path}
            onSelect={setSelected}
            collaborators={collaborators}
            miraFile={miraFile}
            miraMark={mira?.mark}
          />
        )}
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            meeting &&
              'overflow-hidden rounded-[var(--radius-xl)] border bg-card'
          )}
        >
          <WorkbenchFiles
            files={files}
            active={active?.path}
            onSelect={setSelected}
            collaborators={meeting ? collaborators : undefined}
            miraFile={miraFile}
            miraMark={mira?.mark}
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
          {mira && (active || filePresence) && (
            <MiraEditorBar
              mira={mira}
              presence={filePresence}
              editable={editable}
              onAnalyze={(source, intent) => {
                if (!active) return;
                const selection =
                  cursor?.path === active.path ? cursor.selection : undefined;
                const startLine = selection?.startLine ?? 1;
                const endLine =
                  selection &&
                  selection.endLine > startLine &&
                  selection.endColumn === 1
                    ? selection.endLine - 1
                    : (selection?.endLine ?? startLine);
                mira.onAction({
                  action: 'analyze',
                  source,
                  intent,
                  range: { filePath: active.path, startLine, endLine },
                  failure:
                    intent === 'fix' && tests && failedIndex !== undefined
                      ? { submissionId: tests.submissionId, index: failedIndex }
                      : undefined,
                });
              }}
            />
          )}
          <WorkbenchEditorStage
            roomKey={roomKey}
            file={active}
            language={project.language}
            editable={editable}
            client={room.client}
            presence={room.presence}
            actorId={room.ticket.data?.actorId}
            mira={filePresence}
            jump={jump?.path === active?.path ? jump : undefined}
            onSelection={
              meeting && active
                ? (selection) => setCursor({ path: active.path, selection })
                : undefined
            }
          />
          {mira && (
            <MiraCodeReview
              mira={mira}
              presence={filePresence}
              editable={editable}
            />
          )}
        </div>
        {meeting && (
          <WorkbenchMeetingOutput
            {...output}
            tab={outputTab}
            onTab={setOutputTab}
            test={tests}
            testing={test.isPending}
            canTest={!!meeting.runTests}
            selectedFailureIndex={failedIndex}
            onSelectFailure={
              tests
                ? (index) => setFailure({ run: tests.submissionId, index })
                : undefined
            }
            failureLink={
              linked && failureLink && files.includes(linked.filePath)
                ? {
                    index: failureLink.index,
                    line: linked.startLine,
                    jump: () => {
                      setSelected(linked.filePath);
                      setJump((last) => ({
                        path: linked.filePath,
                        line: linked.startLine,
                        request: (last?.request ?? 0) + 1,
                      }));
                    },
                  }
                : undefined
            }
            checkpoint={
              canCheckpoint
                ? {
                    pending: save.isPending || run.isPending || busy,
                    save: () => save.mutate(),
                    state:
                      save.isSuccess && selectedSave !== 'failed'
                        ? 'saved'
                        : selectedSave,
                  }
                : undefined
            }
            preview={previewSettings}
          />
        )}
      </div>
      {!meeting && (
        <WorkbenchOutput
          {...output}
          open={outputOpen}
          onToggle={() => setOutputOpen((value) => !value)}
          preview={preview ? previewSettings : undefined}
        />
      )}
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
