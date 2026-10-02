import { describe, expect, it, vi } from 'vitest';
import type { ProgrammingProblemRow } from './programming-model';
import {
  createProgrammingProblem,
  editProgrammingProblem,
  getProgrammingProblem,
  listProgrammingProblems,
  type ProgrammingRepository,
} from './programming-service';

const access = {
  wsId: '22222222-2222-4222-8222-222222222222',
  actorId: '33333333-3333-4333-8333-333333333333',
  mode: 'learner' as const,
};
const row: ProgrammingProblemRow = {
  id: '11111111-1111-4111-8111-111111111111',
  ws_id: access.wsId,
  slug: 'synthetic',
  title: { en: 'Example', vi: 'Ví dụ' },
  prompt: { en: 'Add', vi: 'Cộng' },
  difficulty: 'easy',
  topic: 'arrays',
  starter_code: '',
  status: 'published',
  revision: 1,
};
const payload = {
  slug: row.slug,
  title: row.title,
  prompt: row.prompt,
  difficulty: row.difficulty,
  topic: row.topic,
  starterCode: '',
  status: row.status,
  cases: [{ input: '1', expected: '1', visible: true }],
};
function repository(
  overrides: Partial<ProgrammingRepository> = {}
): ProgrammingRepository {
  return {
    list: vi.fn().mockResolvedValue([row]),
    find: vi.fn().mockResolvedValue(row),
    snapshot: vi.fn().mockResolvedValue({ problem: row, cases: [] }),
    write: vi.fn().mockResolvedValue({ ...row, revision: 2 }),
    ...overrides,
  };
}

describe('Programming scoped service boundary', () => {
  it('does not accept foreign or unpublished rows even if storage returns them', async () => {
    for (const problem of [
      { ...row, ws_id: 'foreign' },
      { ...row, status: 'draft' as const },
    ]) {
      const repo = repository({
        snapshot: vi.fn().mockResolvedValue({ problem, cases: [] }),
        list: vi.fn().mockResolvedValue([problem]),
      });
      await expect(
        getProgrammingProblem(repo, access, row.id)
      ).rejects.toMatchObject({ status: 404 });
      await expect(listProgrammingProblems(repo, access)).rejects.toMatchObject(
        { status: 404 }
      );
      expect(repo.write).not.toHaveBeenCalled();
    }
  });
  it('requests public cases and strips hidden answers returned by a faulty adapter', async () => {
    const repo = repository({
      snapshot: vi.fn().mockResolvedValue({
        problem: row,
        cases: [
          {
            problem_id: row.id,
            position: 0,
            input: 'secret',
            expected: 'secret',
            visible: false,
          },
        ],
      }),
    });
    const dto = await getProgrammingProblem(repo, access, row.id);
    expect(repo.snapshot).toHaveBeenCalledWith({
      wsId: access.wsId,
      id: row.id,
      publishedOnly: true,
      author: false,
    });
    expect(JSON.stringify(dto)).not.toContain('secret');
  });
  it('rejects mismatched problem identity or case association', async () => {
    await expect(
      getProgrammingProblem(
        repository({
          snapshot: vi
            .fn()
            .mockResolvedValue({ problem: { ...row, id: 'wrong' }, cases: [] }),
        }),
        access,
        row.id
      )
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getProgrammingProblem(
        repository({
          snapshot: vi.fn().mockResolvedValue({
            problem: row,
            cases: [{ problem_id: 'wrong' }],
          }),
        }),
        access,
        row.id
      )
    ).rejects.toMatchObject({ status: 500 });
  });
  it('keeps global cases public and global mutation forbidden for authors', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue({ ...row, ws_id: null }),
      snapshot: vi
        .fn()
        .mockResolvedValue({ problem: { ...row, ws_id: null }, cases: [] }),
    });
    const author = { ...access, mode: 'author' as const };
    await getProgrammingProblem(repo, author, row.id);
    expect(repo.snapshot).toHaveBeenCalledWith({
      wsId: access.wsId,
      id: row.id,
      publishedOnly: false,
      author: true,
    });
    await expect(
      editProgrammingProblem(repo, author, row.id, {
        ...payload,
        expectedRevision: 1,
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.write).not.toHaveBeenCalled();
  });
  it('rejects learner writes before inspecting payload or storage', async () => {
    const repo = repository();
    await expect(
      createProgrammingProblem(repo, access, null)
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      editProgrammingProblem(repo, access, row.id, null)
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.find).not.toHaveBeenCalled();
    expect(repo.write).not.toHaveBeenCalled();
  });
  it('stamps trusted scope/actor and forwards expected revision to the atomic writer', async () => {
    const repo = repository();
    const author = { ...access, mode: 'author' as const };
    await createProgrammingProblem(repo, author, payload);
    expect(repo.write).toHaveBeenLastCalledWith({
      wsId: access.wsId,
      actorId: access.actorId,
      problem: payload,
    });
    await editProgrammingProblem(repo, author, row.id, {
      ...payload,
      expectedRevision: 1,
    });
    expect(repo.write).toHaveBeenLastCalledWith({
      wsId: access.wsId,
      actorId: access.actorId,
      id: row.id,
      expectedRevision: 1,
      problem: payload,
    });
  });
  it('preserves storage errors rather than producing successful empty results', async () => {
    const error = new Error('synthetic storage failure');
    await expect(
      listProgrammingProblems(
        repository({ list: vi.fn().mockRejectedValue(error) }),
        access
      )
    ).rejects.toBe(error);
  });
});
