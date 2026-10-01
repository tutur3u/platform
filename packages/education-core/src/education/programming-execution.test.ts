import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EducationAuthContext } from '../types';
import { enqueueProgrammingExecution } from './programming-execution';

const mocks = vi.hoisted(() => ({
  subject: vi.fn(),
  transport: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./programming-access', () => ({
  resolveProgrammingLearnerAccess: mocks.subject,
}));
vi.mock('./programming-repository', () => ({
  createPrivateProgrammingTransport: mocks.transport,
}));
const context = { user: { id: 'actor' }, supabase: {} } as EducationAuthContext;
const problemId = '11111111-1111-4111-8111-111111111111';
const payload = {
  problemId,
  source: 'print(1)',
  language: 'python',
  kind: 'submit',
};
const snapshot = {
  problem: {
    id: problemId,
    ws_id: 'workspace',
    status: 'published',
    revision: 7,
  },
  cases: [
    {
      problem_id: problemId,
      position: 0,
      input: 'public',
      expected: 'public',
      visible: true,
    },
    {
      problem_id: problemId,
      position: 1,
      input: 'PRIVATE INPUT',
      expected: 'PRIVATE ANSWER',
      visible: false,
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.subject.mockResolvedValue({
    readOnly: false,
    wsId: 'workspace',
    studentPlatformUserId: 'actor',
  });
  mocks.transport.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc
    .mockResolvedValueOnce({ data: snapshot, error: null })
    .mockResolvedValueOnce({ data: 'submission', error: null });
});
describe('Programming versioned execution boundary', () => {
  it('rejects parent direct execution before payload or private storage', async () => {
    mocks.subject.mockResolvedValue({ readOnly: true });
    await expect(
      enqueueProgrammingExecution(context, 'workspace', undefined, null)
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.transport).not.toHaveBeenCalled();
  });
  it('binds snapshot revision and actor, returns no private cases', async () => {
    const result = await enqueueProgrammingExecution(
      context,
      'workspace',
      undefined,
      payload
    );
    expect(result).toBe('submission');
    expect(mocks.rpc.mock.calls[1]?.[0]).toBe(
      'enqueue_learn_programming_execution'
    );
    const args = mocks.rpc.mock.calls[1]?.[1];
    expect(args).toMatchObject({
      p_expected_revision: 7,
      p_actor_id: 'actor',
      p_user_id: 'actor',
      p_problem_id: problemId,
    });
    expect(args.p_command[0]).toBe('__ttr_judge_v1__');
    const command = JSON.parse(
      Buffer.from(args.p_command[1], 'base64url').toString()
    );
    expect(command.cases[1].expected).toBe('PRIVATE ANSWER');
    expect(command.cases[1]).not.toHaveProperty('problem_id');
  });
  it('test execution includes public/custom cases only', async () => {
    await enqueueProgrammingExecution(context, 'workspace', undefined, {
      ...payload,
      kind: 'test',
      customCase: { input: 'custom', expected: 'custom' },
    });
    const args = mocks.rpc.mock.calls[1]?.[1];
    const command = Buffer.from(args.p_command[1], 'base64url').toString();
    expect(command).not.toContain('PRIVATE');
    expect(JSON.parse(command).cases).toHaveLength(2);
  });
  it('returns409 for intervening edit/archive without relabeling snapshot cases', async () => {
    mocks.rpc
      .mockReset()
      .mockResolvedValueOnce({ data: snapshot, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: '40001', message: 'PRIVATE ANSWER' },
      });
    await expect(
      enqueueProgrammingExecution(context, 'workspace', undefined, payload)
    ).rejects.toMatchObject({
      status: 409,
      message: 'Problem changed; reload before submitting',
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it('rejects foreign/unpublished snapshots and invalid command payloads', async () => {
    mocks.rpc
      .mockReset()
      .mockResolvedValueOnce({
        data: {
          ...snapshot,
          problem: { ...snapshot.problem, ws_id: 'foreign' },
        },
        error: null,
      });
    await expect(
      enqueueProgrammingExecution(context, 'workspace', undefined, payload)
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await expect(
      enqueueProgrammingExecution(context, 'workspace', undefined, {
        ...payload,
        customCase: { input: '', expected: '' },
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      enqueueProgrammingExecution(context, 'workspace', undefined, {
        ...payload,
        ws_id: 'foreign',
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
