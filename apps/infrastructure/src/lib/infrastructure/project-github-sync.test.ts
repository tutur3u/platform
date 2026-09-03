import type { InfrastructureProject } from '@tuturuuu/internal-api/infrastructure/monitoring';
import type { Sql } from 'postgres';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchCompleteGitHubBranchSnapshot,
  parsePublicGitHubRepoUrl,
  reconcileInfrastructureProjectGitHub,
} from './project-github-sync';

const parsedRepository = parsePublicGitHubRepoUrl(
  'https://github.com/tutur3u/platform'
);

function branch(name: string, sha = `${name}-sha`, protectedBranch = false) {
  return {
    commit: { sha },
    name,
    protected: protectedBranch,
  };
}

function branchPage(prefix: string, count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) =>
    branch(`${prefix}-${index + offset}`)
  );
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function repositoryResponse() {
  return {
    default_branch: 'main',
    full_name: 'tutur3u/platform',
    html_url: 'https://github.com/tutur3u/platform',
    name: 'platform',
    owner: { login: 'tutur3u' },
    private: false,
  };
}

interface RecordedQuery {
  text: string;
  values: unknown[];
}

function createSqlRecorder() {
  const transactionQueries: RecordedQuery[] = [];
  let beginCount = 0;
  const transaction = ((
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    transactionQueries.push({
      text: strings.join(' ? ').replace(/\s+/g, ' ').trim(),
      values,
    });
    return Promise.resolve([]);
  }) as unknown as Sql;
  const sql = (() => Promise.resolve([])) as unknown as Sql;
  Object.assign(sql, {
    begin: async (callback: (client: Sql) => Promise<unknown>) => {
      beginCount += 1;
      return callback(transaction);
    },
  });

  return {
    get beginCount() {
      return beginCount;
    },
    sql,
    transactionQueries,
  };
}

function createSyncFetch(
  pages: Map<number, unknown>,
  options: { commitResponse?: Response } = {}
) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith('/repos/tutur3u/platform')) {
      return jsonResponse(repositoryResponse());
    }
    if (url.includes('/branches?')) {
      const page = Number(new URL(url).searchParams.get('page'));
      const value = pages.get(page);
      if (value instanceof Response) {
        return value;
      }
      return jsonResponse(value);
    }
    if (url.includes('/commits/')) {
      return options.commitResponse ?? jsonResponse({ sha: 'selected-sha' });
    }
    throw new Error(`Unexpected test URL: ${url}`);
  });
}

function syncOptions(fetchImpl: typeof fetch, sql: Sql) {
  const project = { id: 'project-1' } as InfrastructureProject;
  return {
    fetchImpl,
    project: {
      repo_url: 'https://github.com/tutur3u/platform',
      selected_branch: 'main',
    },
    projectId: 'project-1',
    reloadProject: vi.fn(async () => project),
    sql,
  };
}

describe('Infrastructure GitHub project sync', () => {
  it('fetches 150 branches with fixed sequential page URLs', async () => {
    const fetchImpl = createSyncFetch(
      new Map([
        [1, branchPage('branch', 100)],
        [2, branchPage('branch', 50, 100)],
      ])
    );

    const result = await fetchCompleteGitHubBranchSnapshot(
      parsedRepository,
      fetchImpl
    );

    expect(result).toHaveLength(150);
    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
      'https://api.github.com/repos/tutur3u/platform/branches?per_page=100&page=1',
      'https://api.github.com/repos/tutur3u/platform/branches?per_page=100&page=2',
    ]);
  });

  it('rejects a full page 100 at the 10,000 branch ceiling', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get('page'));
      return jsonResponse(branchPage(`page-${page}`, 100));
    });

    await expect(
      fetchCompleteGitHubBranchSnapshot(parsedRepository, fetchImpl)
    ).rejects.toThrow(
      'GitHub branch snapshot exceeds the 10,000 branch safety limit.'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(100);
  });

  it.each([
    ['invalid', { invalid: true }],
    ['failed', new Response(null, { status: 503 })],
  ])(
    'performs zero writes when a later branch page is %s',
    async (_label, secondPage) => {
      const recorder = createSqlRecorder();
      const fetchImpl = createSyncFetch(
        new Map<number, unknown>([
          [1, branchPage('branch', 100)],
          [2, secondPage],
        ])
      );

      await expect(
        reconcileInfrastructureProjectGitHub(
          syncOptions(fetchImpl, recorder.sql)
        )
      ).rejects.toThrow();
      expect(recorder.beginCount).toBe(0);
      expect(recorder.transactionQueries).toHaveLength(0);
    }
  );

  it('rejects conflicting duplicate branch metadata before persistence', async () => {
    const recorder = createSqlRecorder();
    const fetchImpl = createSyncFetch(
      new Map([
        [
          1,
          [branch('main', 'first-sha', false), branch('main', 'other-sha', true)],
        ],
      ])
    );

    await expect(
      reconcileInfrastructureProjectGitHub(syncOptions(fetchImpl, recorder.sql))
    ).rejects.toThrow('GitHub returned conflicting duplicate branch data.');
    expect(recorder.beginCount).toBe(0);
  });

  it('treats a successful empty snapshot as authoritative', async () => {
    const recorder = createSqlRecorder();
    const fetchImpl = createSyncFetch(new Map([[1, []]]));

    await reconcileInfrastructureProjectGitHub(
      syncOptions(fetchImpl, recorder.sql)
    );

    expect(recorder.beginCount).toBe(1);
    expect(recorder.transactionQueries).toHaveLength(3);
    expect(recorder.transactionQueries[1]?.text).toContain(
      'INSERT INTO infrastructure_project_branches'
    );
    expect(recorder.transactionQueries[1]?.values).toContain('[]');
    expect(recorder.transactionQueries[2]?.text).toContain(
      'DELETE FROM infrastructure_project_branches'
    );
    expect(recorder.transactionQueries[2]?.values).toContain('[]');
  });

  it('uses a complete snapshot for selected-branch fallback and stale deletion', async () => {
    const recorder = createSqlRecorder();
    const pages = new Map<number, unknown>([
      [1, branchPage('branch', 100)],
      [2, [branch('release', 'release-sha', true)]],
    ]);
    const fetchImpl = createSyncFetch(pages, {
      commitResponse: new Response(null, { status: 404 }),
    });
    const options = syncOptions(fetchImpl, recorder.sql);
    options.project.selected_branch = 'release';
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await reconcileInfrastructureProjectGitHub(options);

    expect(result).toBe(await options.reloadProject.mock.results[0]?.value);
    expect(recorder.transactionQueries).toHaveLength(3);
    expect(recorder.transactionQueries[0]?.values).toContain('release-sha');
    expect(recorder.transactionQueries[1]?.values).toContainEqual(
      expect.stringContaining('"name":"release"')
    );
    expect(recorder.transactionQueries[2]?.text).toContain('NOT EXISTS');
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it('uses a constant three reconciliation statements for 150 branches', async () => {
    const recorder = createSqlRecorder();
    const fetchImpl = createSyncFetch(
      new Map([
        [1, branchPage('branch', 100)],
        [2, branchPage('branch', 50, 100)],
      ])
    );

    await reconcileInfrastructureProjectGitHub(
      syncOptions(fetchImpl, recorder.sql)
    );

    expect(recorder.beginCount).toBe(1);
    expect(recorder.transactionQueries).toHaveLength(3);
  });
});
