import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from '../client';
import type {
  EnableGitHubBotWatcherAutoPickupResponse,
  GitHubBotState,
  IssueGitHubBotWatcherClientPayload,
  IssueGitHubBotWatcherClientResponse,
  SaveGitHubBotConfigurationPayload,
  TestGitHubBotConfigurationResponse,
} from './types';

const GITHUB_BOT_CSRF_HEADER = 'x-tuturuuu-github-bot-action';

function githubBotMutationHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set(GITHUB_BOT_CSRF_HEADER, '1');
  return headers;
}

export async function getGitHubBotState(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  return client.json<GitHubBotState>('/api/v1/infrastructure/github-bot', {
    cache: 'no-store',
  });
}

export async function saveGitHubBotConfiguration(
  payload: SaveGitHubBotConfigurationPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<GitHubBotState>('/api/v1/infrastructure/github-bot', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: githubBotMutationHeaders({
      'Content-Type': 'application/json',
    }),
    method: 'PUT',
  });
}

export async function testGitHubBotConfiguration(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TestGitHubBotConfigurationResponse>(
    '/api/v1/infrastructure/github-bot/test',
    {
      body: '{}',
      cache: 'no-store',
      headers: githubBotMutationHeaders({
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }
  );
}

export async function issueGitHubBotWatcherClient(
  payload: IssueGitHubBotWatcherClientPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<IssueGitHubBotWatcherClientResponse>(
    '/api/v1/infrastructure/github-bot/clients',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: githubBotMutationHeaders({
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }
  );
}

export async function enableGitHubBotWatcherAutoPickup(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<EnableGitHubBotWatcherAutoPickupResponse>(
    '/api/v1/infrastructure/github-bot/auto-pickup',
    {
      body: '{}',
      cache: 'no-store',
      headers: githubBotMutationHeaders({
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }
  );
}

export async function revokeGitHubBotWatcherClient(
  clientId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<GitHubBotState>(
    `/api/v1/infrastructure/github-bot/clients/${encodePathSegment(clientId)}`,
    {
      cache: 'no-store',
      headers: githubBotMutationHeaders(),
      method: 'DELETE',
    }
  );
}

export type * from './types';
