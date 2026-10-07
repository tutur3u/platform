import { mkdtemp as makeTempDir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import packageJson from '../../package.json';
import { TuturuuuUserClient } from '../platform';
import { runCalendarFeedbackDispatch } from './calendar-feedback-dispatch';
import { runCli } from './commands';
import * as cliConfig from './config';
import { validateFeedbackCommand } from './feedback';
import { getHelpOutput } from './help';

const id = '12345678-1234-4234-8234-123456789abc';
const row = {
  id,
  title: 'Synthetic title',
  createdAt: '2026-10-08T00:00:00Z',
  status: 'open',
  archivedAt: null,
  revision: 0,
};
const item = {
  ...row,
  body: 'PRIVATE_BODY_SENTINEL',
  updatedAt: row.createdAt,
  capabilities: { canManage: false },
};
const calendarSource = {
  id,
  provider: 'tuturuuu',
  workspaceCalendarId: id,
  label: 'Synthetic calendar',
  color: null,
  writable: true,
};
const calendarResponse = {
  defaultSource: calendarSource,
  options: [calendarSource],
};
const fixtureDirs: string[] = [];
async function mkdtemp(prefix: string) {
  const dir = await makeTempDir(prefix);
  fixtureDirs.push(dir);
  return dir;
}
function clientFor(value: unknown) {
  const fetch = vi.fn().mockResolvedValue(Response.json(value));
  return {
    client: new TuturuuuUserClient({
      accessToken: 'synthetic-token',
      baseUrl: 'https://staging.example.com',
      fetch,
    }),
    fetch,
  };
}
function stdout() {
  return vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
}
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const dir of fixtureDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

// These are synthetic local config and response fixtures, with no live transport.
describe('feedback CLI registration', () => {
  it('rejects duplicate raw flags and bad show before network', async () => {
    expect(() =>
      validateFeedbackCommand(['feedback', 'list'], { limit: '2' }, [
        'feedback',
        'list',
        '--limit',
        '1',
        '--limit=2',
      ])
    ).toThrow('feedback_invalid_arguments');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(runCli(['feedback', 'show', 'not-uuid'])).rejects.toThrow(
      'feedback_invalid_arguments'
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('dispatches before lazy workspace resolution', async () => {
    const { client } = clientFor({ items: [row], nextCursor: null });
    const resolveWorkspaceId = vi.fn(() => {
      throw new Error('workspace must not resolve');
    });
    stdout();
    expect(
      await runCalendarFeedbackDispatch(
        {
          client,
          flags: {},
          json: true,
          positionals: ['feedback', 'list'],
        },
        resolveWorkspaceId
      )
    ).toBe(true);
    expect(resolveWorkspaceId).not.toHaveBeenCalled();
  });
  it('runs actual feedback CLI with no selected workspace and no global content renderer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'feedback-cli-v23-'));
    const config = join(dir, 'config.json');
    await writeFile(
      config,
      JSON.stringify({
        baseUrl: 'https://staging.example.com',
        session: {
          accessToken: 'synthetic-token',
          refreshToken: 'synthetic-refresh',
        },
      })
    );
    vi.stubEnv('TUTURUUU_CONFIG', config);
    const fetch = vi.fn().mockResolvedValue(Response.json(item));
    vi.stubGlobal('fetch', fetch);
    const write = stdout();
    await runCli(['feedback', 'show', id, '--json', '--no-update-check']);
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).not.toHaveProperty(
      'body'
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
  it('scoped feedback help is available without config or network', async () => {
    vi.stubEnv('TUTURUUU_CONFIG', '/nonexistent/feedback.json');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const write = stdout();
    await runCli(['feedback', '--help']);
    expect(String(write.mock.calls[0]?.[0])).toContain('--include-content');
    expect(fetch).not.toHaveBeenCalled();
    expect(getHelpOutput('calendar')).toContain(
      'same authenticated calendar APIs'
    );
    expect(getHelpOutput('tasks', 'completed')).toBe(
      getHelpOutput('tasks', 'done')
    );
    vi.unstubAllGlobals();
  });

  it.each([
    ['feedback', 'list', '--limit', '1', '--limit=2'],
    ['feedback', 'show', 'not-uuid'],
  ])(
    'validates raw argv before config and update transport: %j',
    async (...argv) => {
      const readConfig = vi.spyOn(cliConfig, 'readCliConfig');
      const fetch = vi.fn(() => {
        throw new Error('unexpected transport');
      });
      vi.stubGlobal('fetch', fetch);
      vi.stubEnv('TUTURUUU_CONFIG', '/nonexistent/feedback-preflight.json');
      await expect(runCli(argv)).rejects.toThrow('feedback_invalid_arguments');
      expect(readConfig).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('resolves workspace once for actual calendar dispatch', async () => {
    const { client, fetch } = clientFor(calendarResponse);
    const resolveWorkspaceId = vi.fn(() => id);
    stdout();
    expect(
      await runCalendarFeedbackDispatch(
        {
          client,
          flags: {},
          json: true,
          positionals: ['calendar', 'sources', 'list'],
        },
        resolveWorkspaceId
      )
    ).toBe(true);
    expect(resolveWorkspaceId).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toContain(
      `/workspaces/${id}/calendar/default-source`
    );
  });

  it('leaves other groups to the workspace dispatcher without resolving workspace', async () => {
    const { client, fetch } = clientFor([]);
    const resolveWorkspaceId = vi.fn(() => id);
    expect(
      await runCalendarFeedbackDispatch(
        { client, flags: {}, json: true, positionals: ['tasks', 'list'] },
        resolveWorkspaceId
      )
    ).toBe(false);
    expect(resolveWorkspaceId).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains actual calendar CLI routing with the selected workspace', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'feedback-registration-calendar-'));
    const config = join(dir, 'config.json');
    await writeFile(
      config,
      JSON.stringify({
        baseUrl: 'https://staging.example.com',
        currentWorkspaceId: id,
        session: {
          accessToken: 'synthetic-token',
          refreshToken: 'synthetic-refresh',
        },
      })
    );
    vi.stubEnv('TUTURUUU_CONFIG', config);
    const fetch = vi.fn().mockResolvedValue(Response.json(calendarResponse));
    vi.stubGlobal('fetch', fetch);
    stdout();
    await runCli(['calendar', 'sources', 'list', '--json', '--no-update-check']);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toContain(
      `/workspaces/${id}/calendar/default-source`
    );
  });

  it.each([
    ['feedback', '--help'],
    ['help', 'feedback'],
    ['calendar', '--help'],
    ['--version'],
  ])('answers help/version before config or network: %j', async (...argv) => {
    const readConfig = vi.spyOn(cliConfig, 'readCliConfig');
    vi.stubEnv('TUTURUUU_CONFIG', '/nonexistent/feedback-registration-help.json');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const write = stdout();
    await runCli(argv);
    expect(readConfig).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(String(write.mock.calls[0]?.[0])).toContain(
      argv[0] === '--version' ? packageJson.version : 'Usage:'
    );
  });
});
