import type {
  PlaygroundExecutionResult,
  PlaygroundIndex,
  PlaygroundLanguage,
  PlaygroundProject,
} from '@tuturuuu/types/primitives/playgrounds';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

const root = '/api/v1/users/me/playgrounds';
const projectPath = (id: string) => `${root}/${encodePathSegment(id)}`;
export function listHostedPlaygrounds(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<PlaygroundIndex>(root, {
    cache: 'no-store',
  });
}
export function createHostedPlayground(
  payload: { name: string; language: PlaygroundLanguage },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ id: string }>(root, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
}
export function getHostedPlayground(
  id: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<PlaygroundProject>(
    projectPath(id),
    { cache: 'no-store' }
  );
}
export function saveHostedPlayground(
  id: string,
  payload: Pick<PlaygroundProject, 'revision' | 'files' | 'command'>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    revision: number;
    drivePath: string | null;
  }>(projectPath(id), {
    method: 'PUT',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
}
export function runHostedPlayground(
  id: string,
  payload: { operation: 'run' | 'stop'; requestId: string; stdin?: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ runId: string }>(
    `${projectPath(id)}/runs`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    }
  );
}
export function getHostedPlaygroundRun(
  id: string,
  runId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<PlaygroundExecutionResult>(
    `${projectPath(id)}/runs/${encodePathSegment(runId)}`,
    { cache: 'no-store' }
  );
}
export function hostedPlaygroundPreviewUrl(id: string, port: number) {
  return `${projectPath(id)}/preview/${port}/`;
}
export interface ProgrammingCollaborationJoin {
  endpoint: string;
  token: string;
  role: 'owner' | 'editor' | 'viewer';
  actorId: string;
  revision?: number;
  project: PlaygroundProject;
}
export function joinHostedPlayground(
  id: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ProgrammingCollaborationJoin>(
    `${projectPath(id)}/collaboration`,
    { cache: 'no-store' }
  );
}
export function checkpointHostedPlayground(
  id: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ProgrammingCollaborationJoin>(
    `${projectPath(id)}/collaboration`,
    { method: 'POST', cache: 'no-store' }
  );
}
export function shareHostedPlayground(
  id: string,
  payload: { userId: string; role: 'editor' | 'viewer' | null },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<boolean>(
    `${projectPath(id)}/collaboration`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}
