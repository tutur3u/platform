import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listHiveResearchTimeline } from './research-timeline';

const mocks = vi.hoisted(() => ({
  ensureHiveResearchSchema: vi.fn(),
  getHiveSql: vi.fn(),
  queries: [] as { text: string; values: unknown[] }[],
}));

vi.mock('./hive-db', () => ({
  getHiveSql: (...args: unknown[]) => mocks.getHiveSql(...args),
}));

vi.mock('./research-schema', () => ({
  ensureHiveResearchSchema: (...args: unknown[]) =>
    mocks.ensureHiveResearchSchema(...args),
}));

function createMockHiveSql() {
  return vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    mocks.queries.push({
      text: Array.from(strings).join('?'),
      values,
    });
    return Promise.resolve([]);
  });
}

function getWorkflowRunQuery() {
  const query = mocks.queries.find(({ text }) =>
    text.includes('from hive_workflow_runs')
  );
  expect(query).toBeDefined();
  return query as { text: string; values: unknown[] };
}

describe('listHiveResearchTimeline', () => {
  beforeEach(() => {
    mocks.queries.length = 0;
    mocks.ensureHiveResearchSchema.mockResolvedValue(undefined);
    mocks.getHiveSql.mockReturnValue(createMockHiveSql());
  });

  it('filters workflow runs through visible workflows for Hive members', async () => {
    await listHiveResearchTimeline({
      isAdmin: false,
      serverId: '00000000-0000-4000-8000-000000000001',
    });

    const query = getWorkflowRunQuery();
    expect(query.text).toContain('join hive_workflows workflows');
    expect(query.text).toContain('workflows.archived_at is null');
    expect(query.text).toContain('or workflows.enabled = true');
    expect(query.values).toContain(false);
  });

  it('allows Hive admins to include non-archived disabled workflow runs', async () => {
    await listHiveResearchTimeline({
      isAdmin: true,
      serverId: '00000000-0000-4000-8000-000000000001',
    });

    const query = getWorkflowRunQuery();
    expect(query.text).toContain('workflows.archived_at is null');
    expect(query.values).toContain(true);
  });
});
