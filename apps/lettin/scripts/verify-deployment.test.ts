import { describe, expect, it, vi } from 'vitest';
import {
  runVerifierCli,
  type VerificationDiagnostic,
  verifyDeployment,
} from './verify-deployment';

const expected = 'canary-private-tag';
const healthy = () => ({
  service: 'lettin',
  status: 'ok',
  deployment: { tag: expected },
  storage: { database: 'd1', artwork: 'r2' },
});
function fixture(
  handler: (path: string, index: number) => Response | Promise<Response>
) {
  const paths: string[] = [];
  const signals: AbortSignal[] = [];
  const logs: VerificationDiagnostic[] = [];
  const delays: number[] = [];
  return {
    paths,
    signals,
    logs,
    delays,
    dependencies: {
      fetch: vi.fn(async (url: string, init: { signal: AbortSignal }) => {
        const path = new URL(url).pathname;
        paths.push(path);
        signals.push(init.signal);
        return handler(path, paths.length);
      }),
      sleep: vi.fn(async (milliseconds: number) => {
        delays.push(milliseconds);
      }),
      log: vi.fn((diagnostic: VerificationDiagnostic) => {
        logs.push({ ...diagnostic });
      }),
    },
  };
}
const json = (value: unknown, status = 200) => Response.json(value, { status });
async function exhausted(f: ReturnType<typeof fixture>) {
  await expect(verifyDeployment(expected, f.dependencies)).rejects.toThrow(
    'Lettin version and storage verification failed'
  );
  expect(f.logs).toHaveLength(12);
  expect(f.logs.map((item) => item.attempt)).toEqual(
    Array.from({ length: 12 }, (_, index) => index + 1)
  );
  expect(f.delays).toEqual(Array(12).fill(5000));
}
describe('actual Lettin deployment verifier', () => {
  it('checks health then both pages, with 15-second signals and no success delay', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      const f = fixture((path) =>
        path.endsWith('/health') ? json(healthy()) : new Response()
      );
      await verifyDeployment(expected, f.dependencies);
      expect(f.paths).toEqual([
        '/api/v1/lettin/health',
        '/login',
        '/api/v1/lettin/worlds',
      ]);
      expect(timeout.mock.calls.map((args) => args[0])).toEqual([
        15000, 15000, 15000,
      ]);
      expect(f.signals.every((signal) => signal instanceof AbortSignal)).toBe(
        true
      );
      expect(f.logs).toEqual([]);
      expect(f.delays).toEqual([]);
    } finally {
      timeout.mockRestore();
    }
  });
  for (const [name, mutate, field] of [
    [
      'service',
      (data: ReturnType<typeof healthy>) => {
        data.service = 'other';
      },
      'serviceMatch',
    ],
    [
      'status',
      (data: ReturnType<typeof healthy>) => {
        data.status = 'unready';
      },
      'statusMatch',
    ],
    [
      'tag',
      (data: ReturnType<typeof healthy>) => {
        data.deployment.tag = 'other';
      },
      'tagMatch',
    ],
    [
      'database',
      (data: ReturnType<typeof healthy>) => {
        data.storage.database = 'other';
      },
      'databaseMatch',
    ],
    [
      'artwork',
      (data: ReturnType<typeof healthy>) => {
        data.storage.artwork = 'other';
      },
      'artworkMatch',
    ],
  ] as const) {
    it(`retains the strict ${name} predicate`, async () => {
      const data = healthy();
      mutate(data);
      const f = fixture(() => json(data));
      await exhausted(f);
      expect(f.paths.every((path) => path.endsWith('/health'))).toBe(true);
      expect(f.logs[0]?.[field]).toBe(false);
      expect(f.logs[0]?.failureCategory).toBe('criteria');
    });
  }
  it('rejects health HTTP failure even when every payload predicate matches', async () => {
    const f = fixture(() => json(healthy(), 503));
    await exhausted(f);
    expect(f.logs[0]).toMatchObject({
      stage: 'health',
      failureCategory: 'http',
      httpStatus: 503,
      tagMatch: true,
    });
  });
  it('classifies malformed JSON without logging the body', async () => {
    const f = fixture(() => new Response('canary-private-body'));
    await exhausted(f);
    expect(f.logs[0]).toMatchObject({
      failureCategory: 'parse',
      parseSucceeded: false,
      httpStatus: 200,
    });
  });
  for (const data of [null, [], 'canary-private-body', 17]) {
    it(`rejects non-object health shape ${typeof data}`, async () => {
      const f = fixture(() => json(data));
      await exhausted(f);
      expect(f.logs[0]).toMatchObject({
        failureCategory: 'shape',
        parseSucceeded: true,
      });
    });
  }
  it('rejects missing nested health fields', async () => {
    const f = fixture(() => json({ service: 'lettin', status: 'ok' }));
    await exhausted(f);
    expect(f.logs[0]).toMatchObject({
      tagMatch: false,
      databaseMatch: false,
      artworkMatch: false,
    });
  });
  for (const name of ['Error', 'TimeoutError', 'AbortError']) {
    it(`classifies ${name} without exception details`, async () => {
      const error = new Error('canary-private-exception');
      error.name = name;
      const f = fixture(() => {
        throw error;
      });
      await exhausted(f);
      expect(f.logs[0]).toMatchObject({
        httpStatus: null,
        timeout: name !== 'Error',
        failureCategory: name === 'Error' ? 'network' : 'timeout',
      });
    });
  }
  it('skips worlds when login fails', async () => {
    const f = fixture((path) =>
      path.endsWith('/health')
        ? json(healthy())
        : new Response(null, { status: 403 })
    );
    await exhausted(f);
    expect(f.paths).not.toContain('/api/v1/lettin/worlds');
    expect(f.logs[0]).toMatchObject({
      stage: 'login',
      failureCategory: 'http',
      httpStatus: 403,
    });
  });
  it('fails when the second page fails', async () => {
    const f = fixture((path) =>
      path.endsWith('/health')
        ? json(healthy())
        : new Response(null, { status: path === '/login' ? 200 : 500 })
    );
    await exhausted(f);
    expect(f.logs[0]).toMatchObject({
      stage: 'worlds',
      failureCategory: 'http',
      httpStatus: 500,
    });
  });
  it('classifies smoke request timeout at its stage', async () => {
    const f = fixture((path) => {
      if (path.endsWith('/health')) return json(healthy());
      const error = new Error('canary-private-exception');
      error.name = 'TimeoutError';
      throw error;
    });
    await exhausted(f);
    expect(f.logs[0]).toMatchObject({
      stage: 'login',
      failureCategory: 'timeout',
      httpStatus: null,
      timeout: true,
    });
  });
  it('recovers on a later attempt with only the preceding delay', async () => {
    const f = fixture((path, index) =>
      path.endsWith('/health')
        ? json(healthy(), index === 1 ? 503 : 200)
        : new Response()
    );
    await verifyDeployment(expected, f.dependencies);
    expect(f.logs).toHaveLength(1);
    expect(f.delays).toEqual([5000]);
    expect(f.paths).toHaveLength(4);
  });
  it('fails before any request when the CLI environment guard is absent', async () => {
    const f = fixture(() => json(healthy()));
    await expect(runVerifierCli({}, f.dependencies)).rejects.toThrow(
      'EXPECTED_VERSION_TAG is required'
    );
    expect(f.paths).toEqual([]);
    expect(f.logs).toEqual([]);
    expect(f.delays).toEqual([]);
  });
  it('never logs body, exception, tag, or URL canaries', async () => {
    const f = fixture(() =>
      json({
        ...healthy(),
        deployment: { tag: 'canary-private-response' },
        extra: 'canary-private-body',
      })
    );
    await exhausted(f);
    const rendered = JSON.stringify(f.logs);
    for (const value of [
      expected,
      'canary-private-response',
      'canary-private-body',
      'canary-private-exception',
      'http',
      '://',
    ]) {
      // The fixed failure category is allowed; URL schemes and private values are not.
      if (value !== 'http') expect(rendered).not.toContain(value);
    }
    expect(Object.keys(f.logs[0] ?? {}).sort()).toEqual(
      [
        'attempt',
        'stage',
        'failureCategory',
        'httpStatus',
        'parseSucceeded',
        'serviceMatch',
        'statusMatch',
        'tagMatch',
        'databaseMatch',
        'artworkMatch',
        'timeout',
      ].sort()
    );
  });
});
