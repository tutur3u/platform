import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { applyOperation, type DurableStore } from './store';
import worker from './worker';

const sha = 'a'.repeat(40);
const repo = 'owner/repo';
const delivery = '00000000-0000-4000-8000-000000000001';
const url = 'https://fleet.test';
const secret = 'fixture-signing-key';
const operation = { kind: 'status', repo, sha } as const;

function storage() {
  const values = new Map<string, unknown>();
  const store: DurableStore = {
    async get<T>(key: string) {
      return structuredClone(values.get(key)) as T | undefined;
    },
    async put(key, value) {
      values.set(key, structuredClone(value));
    },
  };
  return { store, put: vi.spyOn(store, 'put') };
}

function app() {
  const { store, put } = storage();
  const upstream = vi.fn<typeof fetch>();
  const dispatch = vi.fn(async (request: Request) =>
    applyOperation(store, await request.json(), { now: () => 0, upstream })
  );
  const env = {
    FLEET_STATUS_ENABLED: 'true',
    FLEET_STATUS_REPOS: repo,
    FLEET_STATUS_READ_TOKEN: 'read-fixture',
    FLEET_STATUS_OPERATOR_TOKEN: 'operator-fixture',
    GITHUB_WEBHOOK_SECRET: secret,
    FLEET_STATUS_STATE: {
      idFromName: () => 'state',
      get: () => ({ fetch: dispatch }),
    },
  };
  return { store, put, fetch: dispatch, env };
}

function webhook(body: string, signatureBody = body) {
  return new Request(`${url}/v1/github/webhook`, {
    method: 'POST',
    body,
    headers: {
      'X-GitHub-Event': 'workflow_run',
      'X-GitHub-Delivery': delivery,
      'X-Hub-Signature-256': `sha256=${createHmac('sha256', secret)
        .update(signatureBody)
        .digest('hex')}`,
    },
  });
}

describe('fleet status Worker', () => {
  it('rejects changed bytes, unsigned readers and oversized webhook bodies before storage', async () => {
    const { env, fetch } = app();
    expect(
      (await worker.fetch(webhook('{"name":"altered"}', '{}'), env)).status
    ).toBe(403);
    expect(
      (await worker.fetch(webhook(' '.repeat(1024 * 1024 + 1)), env)).status
    ).toBe(413);
    expect(
      (
        await worker.fetch(
          new Request(`${url}/v1/repos/${repo}/commits/${sha}/status`),
          env
        )
      ).status
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('deduplicates signed deliveries and does not store arbitrary payload fields', async () => {
    const { env, put } = app();
    const start = new Request(`${url}/v1/control/start`, {
      method: 'POST',
      headers: { Authorization: 'Bearer operator-fixture' },
    });
    expect((await worker.fetch(start, env)).status).toBe(204);

    const body = JSON.stringify({
      repository: { full_name: repo },
      workflow_run: {
        id: 1,
        head_sha: sha,
        status: 'completed',
        conclusion: 'success',
        updated_at: '2026-11-28T00:00:00Z',
        raw_private_text: 'fixture-private-value',
      },
    });
    expect((await worker.fetch(webhook(body), env)).status).toBe(204);
    expect((await worker.fetch(webhook(body), env)).status).toBe(204);
    expect(put).toHaveBeenCalledTimes(2);

    const read = new Request(`${url}/v1/repos/${repo}/commits/${sha}/status`, {
      headers: { Authorization: 'Bearer read-fixture' },
    });
    const result = await worker.fetch(read, env);
    expect(result.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await result.json()).toMatchObject({
      coverage: 'partial',
      runs: [{ id: 1, status: 'completed' }],
    });
    expect(JSON.stringify(put.mock.calls)).not.toContain(
      'fixture-private-value'
    );
  });

  it('persists the fallback budget before a failed read and the stop fence across handler replacement', async () => {
    const { store, put } = storage();
    const upstream = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('offline'));
    const deps = { now: () => 0, upstream, githubToken: 'upstream-fixture' };
    expect((await applyOperation(store, operation, deps)).status).toBe(503);
    await applyOperation(store, { kind: 'start' }, deps);
    await applyOperation(store, operation, deps);
    await applyOperation(store, { ...operation, sha: 'b'.repeat(40) }, deps);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(2);
    await applyOperation(store, { kind: 'stop' }, deps);
    const reopened = { ...deps, now: () => 120_000 };
    expect((await applyOperation(store, operation, reopened)).status).toBe(503);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(3);
  });
  it('revalidates a complete cached snapshot with its ETag and performs one request per slot', async () => {
    const { store, put } = storage();
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { total_count: 0, workflow_runs: [] },
          { headers: { ETag: '"runs"' } }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    let now = 0;
    const deps = { now: () => now, upstream, githubToken: 'upstream-fixture' };
    await applyOperation(store, { kind: 'start' }, deps);
    const first = await applyOperation(store, operation, deps);
    expect(await first.json()).toMatchObject({ coverage: 'complete' });
    expect(put).toHaveBeenCalledTimes(3);
    now = 59_999;
    await applyOperation(store, operation, deps);
    expect(upstream).toHaveBeenCalledTimes(1);
    now = 60_000;
    const second = await applyOperation(store, operation, deps);
    expect(await second.json()).toMatchObject({
      coverage: 'complete',
      observedAt: 60_000,
    });
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(upstream.mock.calls[1]?.[1]?.headers).toMatchObject({
      'If-None-Match': '"runs"',
    });
    expect(put).toHaveBeenCalledTimes(5);
  });
});
