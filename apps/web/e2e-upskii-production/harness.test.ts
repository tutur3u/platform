import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, sweep, verify } from './cleanup';
import { Ledger } from './ledger';
import {
  allowedBrowserRequest,
  isTuturuuuQaEmail,
  isUpskiiCookieDomain,
  isUpskiiQaEmail,
  marker,
  markerRun,
  on,
  parseSuites,
  readRunConfig,
} from './policy';

const dirs: string[] = [];
function ledger() {
  const dir = mkdtempSync(join(tmpdir(), 'upskii-e2e-'));
  dirs.push(dir);
  return new Ledger(join(dir, 'ledger.jsonl'));
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe('policy', () => {
  it('requires the kill switch and a valid run label', () => {
    const base = {
      UPSKII_PRODUCTION_E2E_ENABLED: 'true',
      UPSKII_E2E_RUN_LABEL: 'gh-123-1',
      UPSKII_E2E_LEDGER: '/tmp/l.jsonl',
    };
    expect(readRunConfig(base).suites).toEqual([
      'meet-flow',
      'learner',
      'educator',
      'admin',
    ]);
    expect(() =>
      readRunConfig({ ...base, UPSKII_PRODUCTION_E2E_ENABLED: 'false' })
    ).toThrow(/disabled/);
    expect(() =>
      readRunConfig({ ...base, UPSKII_E2E_RUN_LABEL: '../x' })
    ).toThrow();
    expect(() => parseSuites('learner,billing')).toThrow(/Unknown suite/);
    expect(parseSuites('admin, learner')).toEqual(['admin', 'learner']);
  });

  it('only accepts QA identities', () => {
    expect(isTuturuuuQaEmail('qa+ab12cd34-1@tutur3u.com')).toBe(true);
    expect(isTuturuuuQaEmail('qa+ab12cd34-1@tuturuuu.com')).toBe(true);
    expect(isTuturuuuQaEmail('someone@tuturuuu.com')).toBe(false);
    expect(isTuturuuuQaEmail('qa+ab12cd34-1@tuturuuu.com.evil.io')).toBe(false);
    expect(isUpskiiQaEmail('qa-fleet+gh-1-1-teacher@tuturuuu.com')).toBe(true);
    expect(isUpskiiQaEmail('teacher@upskii.com')).toBe(false);
  });

  it('admits only upskii.com and its subdomains as cookie domains', () => {
    for (const ok of [
      'upskii.com',
      '.upskii.com',
      'app.upskii.com',
      '.APP.upskii.com',
    ])
      expect(isUpskiiCookieDomain(ok)).toBe(true);
    for (const bad of [
      'evilupskii.com',
      '.evilupskii.com',
      'upskii.com.evil.com',
      'app.upskii.com.evil.com',
      'upskii.co',
      '',
    ])
      expect(isUpskiiCookieDomain(bad)).toBe(false);
  });

  it('marks created objects with the run label', () => {
    const title = marker('gh-9-1', 'class');
    expect(title).toBe('[QA-E2E gh-9-1] class');
    expect(markerRun(title)).toBe('gh-9-1');
    expect(markerRun('Real class')).toBeNull();
  });

  it('fences browser writes to product origins', () => {
    expect(allowedBrowserRequest('https://cdn.example.com/a.js', 'GET')).toBe(
      true
    );
    expect(allowedBrowserRequest('https://app.upskii.com/api/x', 'POST')).toBe(
      true
    );
    expect(allowedBrowserRequest('https://evil.example.com/x', 'POST')).toBe(
      false
    );
    expect(
      allowedBrowserRequest(
        'https://abcdefghijabcdefghij.supabase.co/auth/v1/token',
        'POST'
      )
    ).toBe(true);
    expect(
      allowedBrowserRequest(
        'https://abcdefghijabcdefghij.supabase.co/rest/v1/users',
        'POST'
      )
    ).toBe(false);
  });

  it('keeps product paths on their host', () => {
    expect(on('upskiiApp', '/api/x')).toBe('https://app.upskii.com/api/x');
    expect(() => on('upskiiApp', '//evil.example.com/x')).toThrow();
    expect(() => on('upskiiApp', 'https://evil.example.com')).toThrow();
  });
});

describe('ledger', () => {
  it('folds registrations and cleanup events', () => {
    const l = ledger();
    l.register({
      key: 'tuturuuu-qa-run:r',
      kind: 'tuturuuu-qa-run',
      suite: 's',
      actor: 'operator',
    });
    l.register({
      key: 'tuturuuu-qa-run:r',
      kind: 'tuturuuu-qa-run',
      suite: 's',
      actor: 'operator',
      id: 'run1',
    });
    l.failed('tuturuuu-qa-run:r', new Error('HTTP 503'));
    l.cleaned('tuturuuu-qa-run:r', 'deleted');
    const [state] = l.read();
    expect(state).toMatchObject({
      id: 'run1',
      cleaned: true,
      errors: ['HTTP 503'],
    });
  });
});

function fakes() {
  const tuturuuu = {
    createRun: vi.fn(),
    session: vi.fn(),
    list: vi.fn(async (_run?: string) => [] as never[]),
    cleanupRun: vi.fn(async () => ({ deleted: ['u'] })),
  };
  const upskii = {
    create: vi.fn(),
    list: vi.fn(async () => ({ users: [] as never[], more: false })),
    seedClass: vi.fn(),
    purge: vi.fn(async (_id: string, mode: string) =>
      mode === 'verify'
        ? { counts: { classes: 0 } }
        : { counts: { classes: 1 } }
    ),
  };
  return { tuturuuu, upskii, deps: { tuturuuu, upskii } as never };
}

describe('cleanup', () => {
  it('deletes owners in reverse order and continues past failures', async () => {
    const l = ledger();
    const { tuturuuu, upskii, deps } = fakes();
    l.register({
      key: 'upskii-identity:r:teacher',
      kind: 'upskii-identity',
      suite: 'run',
      actor: 'operator',
      id: 'u1',
    });
    l.register({
      key: 'tuturuuu-qa-run:r',
      kind: 'tuturuuu-qa-run',
      suite: 'm',
      actor: 'operator',
      id: 'run1',
    });
    l.register({
      key: 'never:created',
      kind: 'tuturuuu-qa-run',
      suite: 'm',
      actor: 'operator',
    });
    tuturuuu.cleanupRun.mockRejectedValueOnce(
      new Error('qa cleanup: HTTP 500')
    );
    const failures = await cleanup(l, deps);
    expect(failures).toEqual(['tuturuuu-qa-run:r: qa cleanup: HTTP 500']);
    expect(upskii.purge).toHaveBeenCalledWith('u1', 'apply');
    // Re-running is idempotent and retries only what is left.
    tuturuuu.cleanupRun.mockClear();
    upskii.purge.mockClear();
    expect(await cleanup(l, deps)).toEqual([]);
    expect(tuturuuu.cleanupRun).toHaveBeenCalledWith('run1');
    expect(upskii.purge).not.toHaveBeenCalled();
  });

  it('loops the purge until the server reports no more work', async () => {
    const l = ledger();
    const { upskii, deps } = fakes();
    l.register({
      key: 'upskii-identity:r:student',
      kind: 'upskii-identity',
      suite: 'run',
      actor: 'operator',
      id: 'u2',
    });
    upskii.purge
      .mockResolvedValueOnce({ counts: { files: 50 }, more: true } as never)
      .mockResolvedValueOnce({ counts: { files: 3 } } as never);
    expect(await cleanup(l, deps)).toEqual([]);
    expect(upskii.purge).toHaveBeenCalledTimes(2);
  });

  it('verify reports live owners and uncovered resources as leaks', async () => {
    const l = ledger();
    const { tuturuuu, upskii, deps } = fakes();
    l.register({
      key: 'tuturuuu-qa-run:r',
      kind: 'tuturuuu-qa-run',
      suite: 'm',
      actor: 'operator',
      id: 'run1',
    });
    l.register({
      key: 'upskii-identity:r:teacher',
      kind: 'upskii-identity',
      suite: 'run',
      actor: 'operator',
      id: 'u1',
    });
    l.register({
      key: 'upskii-object:class',
      kind: 'upskii-object',
      suite: 'e',
      actor: 'teacher',
      id: 'c1',
      coveredBy: 'upskii-identity:r:teacher',
    });
    l.register({
      key: 'upskii-object:orphan',
      kind: 'upskii-object',
      suite: 'e',
      actor: 'teacher',
      id: 'c2',
      coveredBy: 'missing',
    });
    tuturuuu.list.mockResolvedValueOnce([{ deletedAt: null }] as never);
    upskii.purge.mockResolvedValueOnce({
      counts: { classes: 0, files: 2 },
    } as never);
    const leaks = await verify(l, deps);
    expect(leaks.map((leak) => leak.key).sort()).toEqual([
      'tuturuuu-qa-run:r',
      'upskii-identity:r:teacher',
      'upskii-object:orphan',
    ]);
  });

  it('sweep removes earlier runs but keeps the current one', async () => {
    const { tuturuuu, upskii, deps } = fakes();
    tuturuuu.list.mockResolvedValueOnce([
      { runId: 'old', purpose: 'upskii-e2e', deletedAt: null },
      { runId: 'old', purpose: 'upskii-e2e', deletedAt: null },
      { runId: 'now', purpose: 'upskii-e2e', deletedAt: null },
      { runId: 'other', purpose: 'meet-rehearsal', deletedAt: null },
      { runId: 'gone', purpose: 'upskii-e2e', deletedAt: '2026-11-24' },
    ] as never);
    upskii.list.mockResolvedValueOnce({
      users: [
        { userId: 'a', runLabel: 'gh-1-1' },
        { userId: 'b', runLabel: 'gh-2-1' },
        { userId: 'fixed' },
      ],
      more: false,
    } as never);
    const result = await sweep(deps, {
      tuturuuuRunIds: ['now'],
      upskiiRunLabel: 'gh-2-1',
    });
    expect(tuturuuu.cleanupRun.mock.calls).toEqual([['old']]);
    expect(upskii.purge.mock.calls).toEqual([['a', 'apply']]);
    expect(result.failures).toEqual([]);
  });

  it('sweep fails loudly when the listing never completes', async () => {
    const { upskii, deps } = fakes();
    let n = 0;
    upskii.list.mockImplementation(
      async () =>
        ({
          users: [{ userId: `x${(n += 1)}`, runLabel: 'gh-1-1' }],
          more: true,
        }) as never
    );
    const result = await sweep(deps);
    expect(result.failures).toContain(
      'upskii-identities: listing incomplete after sweep'
    );
  });
});
