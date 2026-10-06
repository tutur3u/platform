import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type {
  PlaygroundExecutionResult,
  PlaygroundFile,
  PlaygroundIndex,
  PlaygroundLanguage,
  PlaygroundProject,
} from '@tuturuuu/types/primitives/playgrounds';
import {
  AccountServiceError,
  accountPrivateRpc,
} from '@tuturuuu/utils/account-benefits-server';
import { notifyDevboxRun } from '@tuturuuu/utils/devbox-control';
import { Effect, Either, forEachConcurrently } from '@tuturuuu/utils/effect';
import {
  PlaygroundCreate,
  PlaygroundDelta,
  PlaygroundFiles,
  PlaygroundJob,
  PlaygroundSave,
} from '@tuturuuu/utils/playground-schema';
import { playgroundTemplates } from '@tuturuuu/utils/playground-templates';
import {
  deleteWorkspaceStorageObjectByPath,
  downloadWorkspaceStorageObjectForProvider,
  resolveWorkspaceStorageProvider,
  uploadWorkspaceStorageFileDirect,
} from './workspace-storage-provider';

interface FilePointer {
  path: string;
  storagePath: string;
  sha256: string;
  size: number;
}
interface StoredProject {
  id: string;
  name: string;
  language: PlaygroundLanguage;
  revision: number;
  drive_path: string | null;
  file_manifest: FilePointer[];
  command: string;
  active_run: { id: string; status: string } | null;
}
interface StoredIndex {
  personalWorkspaceId: string;
  allowed: boolean;
  projects: StoredProject[];
}
async function index(actorId: string, id?: string) {
  return accountPrivateRpc<StoredIndex>('read_learn_playgrounds', {
    p_actor_id: actorId,
    p_id: id ?? null,
  });
}
function publicProject(
  project: StoredProject
): Omit<PlaygroundProject, 'files'> {
  return {
    id: project.id,
    name: project.name,
    language: project.language,
    revision: project.revision,
    drivePath: project.drive_path,
    command: project.command,
    activeRun: project.active_run,
  };
}
export async function listPlaygrounds(
  actorId: string
): Promise<PlaygroundIndex> {
  const result = await index(actorId);
  const languages = await accountPrivateRpc<PlaygroundLanguage[]>(
    'available_playground_languages',
    {}
  );
  return {
    actorId,
    personalWorkspaceId: result.personalWorkspaceId,
    allowed: result.allowed,
    projects: result.projects.map(publicProject),
    languages,
  };
}
async function ownedProject(
  actorId: string,
  id: string,
  requireBenefit = false
) {
  const result = await index(actorId, id);
  const project = result.projects.find((row) => row.id === id);
  if (!project) throw new AccountServiceError(404);
  if (requireBenefit && !result.allowed) throw new AccountServiceError(403);
  return { ...result, project };
}
export async function getPlaygroundMetadata(actorId: string, id: string) {
  return publicProject((await ownedProject(actorId, id)).project);
}
export async function getPlayground(
  actorId: string,
  id: string
): Promise<PlaygroundProject> {
  const { project, personalWorkspaceId } = await ownedProject(actorId, id);
  const { provider } =
    await resolveWorkspaceStorageProvider(personalWorkspaceId);
  const result = await Effect.runPromise(
    Effect.either(
      forEachConcurrently(
        project.file_manifest,
        (entry) =>
          Effect.tryPromise({
            try: async () => {
              // Only server-created, project-scoped pointers are accepted, even after Drive edits.
              if (
                !entry.storagePath.startsWith(`playgrounds/${id}/`) ||
                !/^[0-9a-f]{64}$/.test(entry.sha256)
              )
                throw new AccountServiceError(500);
              const download = await downloadWorkspaceStorageObjectForProvider(
                personalWorkspaceId,
                provider,
                entry.storagePath
              );
              if (download.buffer.byteLength > 262144)
                throw new AccountServiceError(413);
              if (
                download.buffer.byteLength !== entry.size ||
                createHash('sha256').update(download.buffer).digest('hex') !==
                  entry.sha256
              )
                throw new AccountServiceError(
                  409,
                  'Drive file changed outside playground'
                );
              const content = new TextDecoder('utf-8', { fatal: true }).decode(
                download.buffer
              );
              return { path: entry.path, content };
            },
            catch: (error) =>
              error instanceof AccountServiceError
                ? error
                : new AccountServiceError(500),
          }),
        { concurrency: 2 }
      )
    )
  );
  if (Either.isLeft(result)) throw result.left;
  return {
    ...publicProject(project),
    files: PlaygroundFiles.parse(result.right),
  };
}
export async function savePlayground(
  actorId: string,
  id: string,
  payload: unknown,
  runId?: string,
  meetingId?: string
) {
  const parsed = PlaygroundSave.or(PlaygroundDelta).safeParse(payload);
  if (!parsed.success) throw new AccountServiceError(400);
  const { project, personalWorkspaceId } = await ownedProject(
    actorId,
    id,
    !meetingId
  );
  if (
    project.revision !== parsed.data.revision ||
    (!runId && project.active_run)
  )
    throw new AccountServiceError(409);
  const root = `playgrounds/${id}/${randomUUID()}`;
  const previous = new Map(
    project.file_manifest.map((entry) => [entry.path, entry])
  );
  const prepared = parsed.data.files.map((file) => {
    const bytes = new TextEncoder().encode(file.content);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const old = previous.get(file.path);
    return {
      bytes,
      pointer:
        old?.sha256 === sha256
          ? old
          : {
              path: file.path,
              storagePath: `${root}/${file.path}`,
              sha256,
              size: bytes.byteLength,
            },
    };
  });
  const changed = new Map(
    prepared.map((file) => [file.pointer.path, file.pointer])
  );
  const paths =
    'paths' in parsed.data
      ? parsed.data.paths
      : parsed.data.files.map((file) => file.path);
  // Validate the full inventory before spending any Drive bandwidth.
  const complete = paths
    .map((path) => {
      const pointer = changed.get(path) ?? previous.get(path);
      if (!pointer) throw new AccountServiceError(400);
      return pointer;
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  if (complete.reduce((total, file) => total + file.size, 0) > 2 * 1024 * 1024)
    throw new AccountServiceError(413);
  const uploads = prepared.filter((file) =>
    file.pointer.storagePath.startsWith(`${root}/`)
  );
  let revision: number;
  try {
    // Either waits for every bounded upload before cleanup; no background upload can race deletion.
    const results = await Effect.runPromise(
      forEachConcurrently(
        uploads,
        (file) =>
          Effect.either(
            Effect.tryPromise({
              try: () =>
                uploadWorkspaceStorageFileDirect(
                  personalWorkspaceId,
                  file.pointer.storagePath,
                  file.bytes,
                  {
                    allowEmpty: true,
                    contentType: 'text/plain; charset=utf-8',
                    upsert: false,
                  }
                ),
              catch: () => new AccountServiceError(500, 'Drive save failed'),
            })
          ),
        { concurrency: 2 }
      )
    );
    const failure = results.find(Either.isLeft);
    if (failure && Either.isLeft(failure)) throw failure.left;
    revision = await accountPrivateRpc<number>('publish_learn_playground', {
      p_actor_id: actorId,
      p_id: id,
      p_revision: parsed.data.revision,
      p_path: root,
      p_command: parsed.data.command,
      p_manifest: complete,
      p_run_id: runId ?? null,
      p_meeting_id: meetingId ?? null,
    });
  } catch (error) {
    // Only objects created for this attempt are removable; existing checkpoints are immutable.
    const cleanup = await Promise.allSettled(
      uploads.map((file) =>
        deleteWorkspaceStorageObjectByPath(
          personalWorkspaceId,
          file.pointer.storagePath
        )
      )
    );
    if (cleanup.some((result) => result.status === 'rejected'))
      console.warn('Playground upload cleanup incomplete', { projectId: id });
    throw error;
  }
  return {
    revision,
    drivePath: revision === project.revision ? project.drive_path : root,
  };
}
export async function createPlayground(
  actorId: string,
  payload: unknown,
  meetingId?: string,
  options: { empty?: boolean } = {}
) {
  const parsed = PlaygroundCreate.safeParse(payload);
  if (!parsed.success) throw new AccountServiceError(400);
  const id = await accountPrivateRpc<string>('create_learn_playground', {
    p_actor_id: actorId,
    p_name: parsed.data.name,
    p_language: parsed.data.language,
    p_meeting_id: meetingId ?? null,
  });
  const { path, content, command } = playgroundTemplates[parsed.data.language];
  try {
    await savePlayground(
      actorId,
      id,
      {
        revision: 0,
        files: [{ path, content: options.empty ? '' : content }],
        command,
      },
      undefined,
      meetingId
    );
  } catch (error) {
    await accountPrivateRpc('discard_uninitialized_playground', {
      p_actor_id: actorId,
      p_id: id,
    }).catch(() => console.error('Could not discard uninitialized playground'));
    throw error;
  }
  return { id };
}
export async function executePlayground(
  actorId: string,
  id: string,
  operation: 'run' | 'stop' | 'preview',
  requestId: string,
  extra: { stdin?: string; port?: number; path?: string } = {},
  meetingId?: string
) {
  const project =
    operation === 'run'
      ? await getPlayground(actorId, id)
      : publicProject((await ownedProject(actorId, id, !meetingId)).project);
  const payload = PlaygroundJob.parse({
    projectId: id,
    revision: project.revision,
    language: project.language,
    operation,
    ...(operation === 'run'
      ? {
          files: 'files' in project ? project.files : [],
          command: project.command,
        }
      : {}),
    ...extra,
  });
  const runId = await accountPrivateRpc<string>('enqueue_learn_playground', {
    p_actor_id: actorId,
    p_id: id,
    p_revision: project.revision,
    p_operation: operation,
    p_command: [
      '__ttr_playground_v1__',
      Buffer.from(JSON.stringify(payload)).toString('base64url'),
    ],
    p_request_id: requestId,
    p_meeting_id: meetingId ?? null,
  });
  await notifyDevboxRun(runId);
  return { runId };
}
export async function getPlaygroundRun(
  actorId: string,
  id: string,
  runId: string
) {
  return accountPrivateRpc<
    PlaygroundExecutionResult & { preview: string | null }
  >('read_learn_playground_run', {
    p_actor_id: actorId,
    p_id: id,
    p_run_id: runId,
  });
}
export async function savePlaygroundRunnerFiles(
  runnerId: string,
  runId: string,
  files: PlaygroundFile[],
  paths?: string[]
) {
  const scope = await accountPrivateRpc<{
    actorId: string;
    projectId: string;
    revision: number;
    command: string;
    jobCommand: string[];
    meetingId?: string;
  }>('authorize_playground_callback', {
    p_runner_id: runnerId,
    p_run_id: runId,
  });
  const { syncPlaygroundRunnerFiles } = await import(
    './playground-runner-sync'
  );
  return syncPlaygroundRunnerFiles({
    ...scope,
    runnerId,
    runId,
    files,
    paths: paths ?? files.map((file) => file.path),
  });
}
