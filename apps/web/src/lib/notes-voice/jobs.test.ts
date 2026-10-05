// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  generate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./provider', () => ({ generateBilledNotesVoice: mock.generate }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({
      from: () => {
        const filters = new Map<string, unknown>();
        let operation = 'read';
        let patch: Record<string, unknown> = {};
        const query = {
          select: () => query,
          eq: (key: string, value: unknown) => {
            filters.set(key, value);
            return query;
          },
          insert: (value: Record<string, unknown>) => {
            operation = 'insert';
            patch = value;
            return query;
          },
          update: (value: Record<string, unknown>) => {
            operation = 'update';
            patch = value;
            return query;
          },
          delete: () => {
            operation = 'delete';
            return query;
          },
          maybeSingle: async () => {
            if (operation === 'insert') {
              const id = String(patch.id);
              if (mock.rows.has(id))
                return { data: null, error: { code: '23505' } };
              const row = {
                ...patch,
                status: 'pending',
                revision: 1,
                attempt: 1,
                transcript: null,
                artifact: null,
                error_code: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              mock.rows.set(id, row);
              return { data: { ...row }, error: null };
            }
            const row = [...mock.rows.values()].find((value) =>
              [...filters].every(([key, expected]) => value[key] === expected)
            );
            if (!row) return { data: null, error: null };
            if (operation === 'delete') mock.rows.delete(String(row.id));
            if (operation === 'update') Object.assign(row, patch);
            return { data: { ...row }, error: null };
          },
        };
        return query;
      },
    }),
  }),
}));

import {
  deleteVoiceJob,
  getVoiceJob,
  reserveVoiceJob,
  runVoiceJob,
} from './jobs';
import { NotesVoiceError } from './schema';

const owner = { userId: 'actor', wsId: 'workspace' };
const request = { requestId: 'job', timezone: 'UTC' };
const artifact = {
  title: 'Review',
  summary: 'Summary',
  decisions: [],
  actionItems: [],
  recommendations: [],
  openQuestions: [],
};
beforeEach(() => {
  mock.rows.clear();
  mock.generate.mockReset();
});
describe('actor-owned voice job lifecycle', () => {
  it('replays identical creation and rejects changed payload', async () => {
    const one = await reserveVoiceJob(owner, request, 'hash');
    const two = await reserveVoiceJob(owner, request, 'hash');
    expect(two.job.id).toBe(one.job.id);
    expect(mock.rows.size).toBe(1);
    await expect(
      reserveVoiceJob(owner, request, 'other')
    ).rejects.toMatchObject({ status: 409 });
  });
  it('does not disclose another account/workspace artifact', async () => {
    await reserveVoiceJob(owner, request, 'hash');
    await expect(
      getVoiceJob({ ...owner, userId: 'other' }, 'job')
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getVoiceJob({ ...owner, wsId: 'other' }, 'job')
    ).rejects.toMatchObject({ status: 404 });
  });
  it('claims once even when the same pending work is scheduled concurrently', async () => {
    const { job } = await reserveVoiceJob(owner, request, 'hash');
    mock.generate
      .mockResolvedValueOnce({ transcript: 'Transcript' })
      .mockResolvedValueOnce({ artifact });
    const access = vi.fn().mockResolvedValue(undefined);
    await Promise.all([
      runVoiceJob(owner, job, new Uint8Array(2), access),
      runVoiceJob(owner, job, new Uint8Array(2), access),
    ]);
    expect(mock.generate).toHaveBeenCalledTimes(2);
    expect((await getVoiceJob(owner, 'job')).status).toBe('completed');
    expect(access).toHaveBeenCalledTimes(3);
  });
  it('does not replay an uncertain paid provider failure', async () => {
    const { job } = await reserveVoiceJob(owner, request, 'hash');
    mock.generate.mockRejectedValue(new TypeError('transport interrupted'));
    await runVoiceJob(owner, job, new Uint8Array(2), async () => {});
    expect((await getVoiceJob(owner, 'job')).status).toBe('review_required');
    const replay = await reserveVoiceJob(
      owner,
      { ...request, expectedRevision: 3 },
      'hash'
    );
    expect(replay.start).toBe(false);
    expect(mock.generate).toHaveBeenCalledTimes(1);
  });
  it('retries a known preflight failure only against its current revision', async () => {
    const { job } = await reserveVoiceJob(owner, request, 'hash');
    mock.generate.mockRejectedValue(
      new NotesVoiceError(402, 'credits_unavailable')
    );
    await runVoiceJob(owner, job, new Uint8Array(2), async () => {});
    const failed = await getVoiceJob(owner, 'job');
    expect(failed.status).toBe('failed');
    await expect(reserveVoiceJob(owner, request, 'hash')).rejects.toMatchObject(
      { code: 'retry_revision_required' }
    );
    const retry = await reserveVoiceJob(
      owner,
      { ...request, expectedRevision: failed.revision },
      'hash'
    );
    expect(retry.job.attempt).toBe(2);
    expect(retry.start).toBe(true);
  });
  it('retains successful transcription on a later known failure', async () => {
    const { job } = await reserveVoiceJob(owner, request, 'hash');
    mock.generate
      .mockResolvedValueOnce({ transcript: 'Paid transcript' })
      .mockRejectedValueOnce(new NotesVoiceError(402, 'credits_unavailable'));
    await runVoiceJob(owner, job, new Uint8Array(2), async () => {});
    const failed = await getVoiceJob(owner, 'job');
    const retry = await reserveVoiceJob(
      owner,
      { ...request, expectedRevision: failed.revision },
      'hash'
    );
    mock.generate.mockResolvedValueOnce({ artifact });
    await runVoiceJob(owner, retry.job, new Uint8Array(2), async () => {});
    expect(mock.generate).toHaveBeenCalledTimes(3);
    expect(mock.generate.mock.calls[2]?.[0]).toHaveProperty(
      'transcript',
      'Paid transcript'
    );
  });
  it('completes silence without charging a second analysis phase', async () => {
    const { job } = await reserveVoiceJob(owner, request, 'hash');
    mock.generate.mockResolvedValueOnce({ transcript: '  ' });
    await runVoiceJob(owner, job, new Uint8Array(2), async () => {});
    expect(mock.generate).toHaveBeenCalledTimes(1);
    expect((await getVoiceJob(owner, 'job')).status).toBe('completed');
  });
  it('withholds artifact publication when membership is revoked between phases', async () => {
    const { job } = await reserveVoiceJob(owner, request, 'hash');
    mock.generate.mockResolvedValueOnce({ transcript: 'Private speech' });
    const access = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new NotesVoiceError(403, 'workspace_denied'));
    await runVoiceJob(owner, job, new Uint8Array(2), access);
    expect(mock.generate).toHaveBeenCalledTimes(1);
    const retained = await getVoiceJob(owner, 'job');
    expect(retained.status).toBe('failed');
    expect(retained.artifact).toBeNull();
  });
  it('marks interrupted workers for review without automatic reprocessing', async () => {
    await reserveVoiceJob(owner, request, 'hash');
    Object.assign(mock.rows.get('job')!, {
      status: 'transcribing',
      updated_at: new Date(Date.now() - 211000).toISOString(),
    });
    const job = await getVoiceJob(owner, 'job');
    expect(job.status).toBe('review_required');
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it('blocks deletion during processing and removes completed private artifacts', async () => {
    const { job } = await reserveVoiceJob(owner, request, 'hash');
    await expect(deleteVoiceJob(owner, 'job')).rejects.toMatchObject({
      code: 'job_still_processing',
    });
    mock.generate
      .mockResolvedValueOnce({ transcript: 'text' })
      .mockResolvedValueOnce({ artifact });
    await runVoiceJob(owner, job, new Uint8Array(2), async () => {});
    await deleteVoiceJob(owner, 'job');
    await expect(getVoiceJob(owner, 'job')).rejects.toMatchObject({
      status: 404,
    });
  });
});
