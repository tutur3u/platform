import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CLI_EXIT } from '../cli-contracts';
import { createCredentialStore } from '../credential-store';
import { type RunUpskiiCommandDeps, runUpskiiCommand } from './index';

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'ttr-upskii-live-routes-'));
  tempDirs.push(dir);
  return dir;
}

async function makeProdStore(userToken: string) {
  const homeDir = await makeTempDir();
  const store = createCredentialStore({ env: {}, homeDir, platform: 'linux' });
  await store.set({
    backend: 'file',
    env: 'prod',
    family: 'upskii-user',
    profile: 'default',
    scopes: ['upskii:profile:read', 'upskii:settings:write'],
    secret: userToken,
  });
  return { homeDir, store };
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

async function execCli(
  cmd: string | string[],
  deps: RunUpskiiCommandDeps
): Promise<{ exitCode: number | undefined; stderr: string; stdout: string }> {
  process.exitCode = undefined;
  let stdout = '';
  let stderr = '';
  const argv = Array.isArray(cmd) ? cmd : cmd.split(' ');
  await runUpskiiCommand(argv, {
    envVars: {},
    ...deps,
    write: (c) => {
      stdout += c;
    },
    writeErr: (c) => {
      stderr += c;
    },
  });
  return { exitCode: process.exitCode, stderr, stdout };
}

afterEach(async () => {
  process.exitCode = undefined;
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { force: true, recursive: true });
  }
});

describe('ttr external upskii live-route contracts', () => {
  it('reads learn enrolled classes, validates join payload/ok, enforces experience/filter bounds, and fails closed on 404/405 & expired sessions', async () => {
    const userToken = 'upskii_cli_a_learn_unavail_secret_0007';
    const { store } = await makeProdStore(userToken);
    const seenRequests: Array<{ body?: unknown; method: string; url: string }> =
      [];

    const mockFetch: typeof globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      seenRequests.push({ body, method: init?.method ?? 'GET', url });
      if (url.endsWith('/api/upskii/classes')) {
        return jsonResp({
          enrolled: [
            {
              class: {
                id: 'cls-learn-1',
                subject: 'math',
                title: '[QA-E2E run1] Math 101',
                visibility: 'private',
              },
              membership: { role: 'student' },
              studentCount: 12,
            },
            {
              class: {
                id: 'cls-learn-2',
                subject: 'physics',
                title: 'Physics 201',
                visibility: 'public',
              },
            },
          ],
          marketplaceEnabled: true,
          publicClasses: [{ id: 'pub-1' }, { id: 'pub-2' }],
        });
      }
      if (url.endsWith('/api/upskii/classes/join')) {
        const val = (body as { value?: string } | undefined)?.value;
        if (val === 'BADCODE')
          return jsonResp({ error: 'Invalid join code', ok: false }, 200);
        if (val === 'NULLCODE') {
          return new Response('null', {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }
        return jsonResp({ classId: 'cls-learn-1', ok: true }, 200);
      }
      if (url.includes('/api/auth/get-session')) {
        return new Response('null', {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      if (url.endsWith('/api/upskii/admin/display-preferences')) {
        return new Response('', { status: 405 });
      }
      if (url.endsWith('/api/upskii/tutor/sessions')) {
        return new Response('', { status: 405 });
      }
      if (url.endsWith('/api/upskii/settings/assessment')) {
        return jsonResp({ error: 'Not found' }, 404);
      }
      if (url.endsWith('/api/upskii/integrations/tuturuuu')) {
        return jsonResp({ error: 'Not found' }, 404);
      }
      return jsonResp({});
    };
    const deps = { credentialStore: store, fetch: mockFetch };

    const learnClasses = await execCli(
      'classes list --experience learn --qa-only --env prod --json',
      deps
    );
    expect(learnClasses.exitCode).toBeUndefined();
    const parsedLearn = JSON.parse(learnClasses.stdout) as {
      classes: Array<{ id: string; title: string }>;
      count: number;
      publicClassesCount: number;
    };
    expect(parsedLearn.count).toBe(1);
    expect(parsedLearn.classes[0]?.id).toBe('cls-learn-1');
    expect(parsedLearn.classes[0]?.title).toBe('[QA-E2E run1] Math 101');
    expect(parsedLearn.publicClassesCount).toBe(2);
    expect(seenRequests[0]?.url).toBe(
      'https://app.upskii.com/api/upskii/classes'
    );

    const eduMismatch = await execCli(
      'classes list --experience educator --env prod --json',
      deps
    );
    expect(eduMismatch.exitCode).toBe(CLI_EXIT.conflict);
    expect(eduMismatch.stderr).toContain('UPSKII_EXPERIENCE_MISMATCH');

    const learnMismatch = await execCli(
      'classes list --experience learn --env prod --json',
      {
        credentialStore: store,
        fetch: async () => jsonResp({ classes: [{ id: 'cls-edu-1' }] }),
      }
    );
    expect(learnMismatch.exitCode).toBe(CLI_EXIT.conflict);
    expect(learnMismatch.stderr).toContain('UPSKII_EXPERIENCE_MISMATCH');

    const joinWrongExp = await execCli(
      'classes join --code BADCODE --env prod --reason test --yes --json',
      deps
    );
    expect(joinWrongExp.exitCode).toBe(CLI_EXIT.usage);
    expect(joinWrongExp.stderr).toContain('UPSKII_EXPERIENCE_MISMATCH');

    const joinBad = await execCli(
      'classes join --experience learn --code BADCODE --env prod --reason test --yes --json',
      deps
    );
    expect(joinBad.exitCode).toBe(CLI_EXIT.conflict);
    expect(joinBad.stderr).toContain('UPSKII_CLASS_JOIN_FAILED');
    expect(
      seenRequests.find((r) => r.url.endsWith('/classes/join'))?.body
    ).toEqual({ value: 'BADCODE' });

    const joinNull = await execCli(
      'classes join --experience learn --code NULLCODE --env prod --reason test --yes --json',
      deps
    );
    expect(joinNull.exitCode).toBe(CLI_EXIT.conflict);
    expect(joinNull.stderr).toContain('UPSKII_CLASS_JOIN_FAILED');

    const joinOk = await execCli(
      'classes join --experience learn --code GOODCODE --env prod --reason test --yes --json',
      deps
    );
    expect(joinOk.exitCode).toBeUndefined();
    expect(JSON.parse(joinOk.stdout).ok).toBe(true);

    const expiredProfile = await execCli(
      'accounts profile --env prod --json',
      deps
    );
    expect(expiredProfile.exitCode).toBe(3);
    expect(expiredProfile.stderr).toContain('UPSKII_SESSION_EXPIRED');

    const emptyUserProfile = await execCli(
      'accounts profile --env prod --json',
      {
        credentialStore: store,
        fetch: async () => jsonResp({ session: { id: 's-1' }, user: {} }),
      }
    );
    expect(emptyUserProfile.exitCode).toBe(3);
    expect(emptyUserProfile.stderr).toContain('UPSKII_SESSION_EXPIRED');

    const rootIdOnlyProfile = await execCli(
      'accounts profile --env prod --json',
      {
        credentialStore: store,
        fetch: async () => jsonResp({ id: 'root-only', user: null }),
      }
    );
    expect(rootIdOnlyProfile.exitCode).toBe(3);
    expect(rootIdOnlyProfile.stderr).toContain('UPSKII_SESSION_EXPIRED');

    // Mixed explicit/missing `current` triggers lookup; unresolved lookup marks missing rows `null`, not `false`.
    const mixedSessions = await execCli(
      'accounts sessions list --env prod --json',
      {
        credentialStore: store,
        fetch: async (input) => {
          const url = typeof input === 'string' ? input : input.toString();
          if (url.endsWith('/api/auth/list-sessions')) {
            return jsonResp([
              { current: false, id: 's-explicit' },
              { id: 's-missing' },
            ]);
          }
          return new Response('null', {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        },
      }
    );
    expect(mixedSessions.exitCode).toBeUndefined();
    const parsedMixed = JSON.parse(mixedSessions.stdout) as {
      currentSessionResolved: boolean;
      sessions: Array<{ current: boolean | null; id: string }>;
    };
    expect(parsedMixed.currentSessionResolved).toBe(false);
    expect(parsedMixed.sessions).toEqual([
      expect.objectContaining({ current: false, id: 's-explicit' }),
      expect.objectContaining({ current: null, id: 's-missing' }),
    ]);

    // Blank row ID yields id: null, current: null, and currentSessionResolved: false even when lookup succeeds.
    const blankRowSessions = await execCli(
      'accounts sessions list --env prod --json',
      {
        credentialStore: store,
        fetch: async (input) => {
          const url = typeof input === 'string' ? input : input.toString();
          if (url.endsWith('/api/auth/list-sessions')) {
            return jsonResp([{ id: 's-live' }, { id: '   ' }]);
          }
          return jsonResp({ session: { id: 's-live' }, user: { id: 'u-1' } });
        },
      }
    );
    expect(blankRowSessions.exitCode).toBeUndefined();
    const parsedBlankRow = JSON.parse(blankRowSessions.stdout) as {
      currentSessionResolved: boolean;
      sessions: Array<{ current: boolean | null; id: string | null }>;
    };
    expect(parsedBlankRow.currentSessionResolved).toBe(false);
    expect(parsedBlankRow.sessions).toEqual([
      expect.objectContaining({ current: true, id: 's-live' }),
      expect.objectContaining({ current: null, id: null }),
    ]);

    const promptsClassErr = await execCli(
      'tutor prompts list --class cls-1 --env prod --json',
      deps
    );
    expect(promptsClassErr.exitCode).toBe(CLI_EXIT.usage);
    expect(promptsClassErr.stderr).toContain('UNSUPPORTED_FILTER');

    const promptsBareClassErr = await execCli(
      ['tutor', 'prompts', 'list', '--class', '--env', 'prod', '--json'],
      deps
    );
    expect(promptsBareClassErr.exitCode).toBe(CLI_EXIT.usage);
    expect(promptsBareClassErr.stderr).toContain('UNSUPPORTED_FILTER');

    const promptsEmptyClassErr = await execCli(
      ['tutor', 'prompts', 'list', '--class=', '--env', 'prod', '--json'],
      deps
    );
    expect(promptsEmptyClassErr.exitCode).toBe(CLI_EXIT.usage);
    expect(promptsEmptyClassErr.stderr).toContain('UNSUPPORTED_FILTER');

    const usageDaysErr = await execCli(
      'accounts usage --days 91 --env prod --json',
      deps
    );
    expect(usageDaysErr.exitCode).toBe(CLI_EXIT.usage);
    expect(usageDaysErr.stderr).toContain('INVALID_DAYS');

    const usageBareDaysErr = await execCli(
      ['accounts', 'usage', '--days', '--env', 'prod', '--json'],
      deps
    );
    expect(usageBareDaysErr.exitCode).toBe(CLI_EXIT.usage);
    expect(usageBareDaysErr.stderr).toContain('INVALID_DAYS');

    const classSettingsMissing = await execCli(
      'settings get --section class --env prod --json',
      deps
    );
    expect(classSettingsMissing.exitCode).toBe(CLI_EXIT.usage);
    expect(classSettingsMissing.stderr).toContain('MISSING_FLAG');

    const classSettingsOk = await execCli(
      'settings get --section class --class cls-learn-1 --env prod --json',
      {
        credentialStore: store,
        fetch: async (input) => {
          const url = typeof input === 'string' ? input : input.toString();
          expect(url).toBe(
            'https://app.upskii.com/api/upskii/settings/class-settings?classId=cls-learn-1'
          );
          return jsonResp({ kind: 'class-settings', settings: {} });
        },
      }
    );
    expect(classSettingsOk.exitCode).toBeUndefined();

    for (const cmd of [
      'settings preferences --env prod --json',
      'settings get --section assessment --env prod --json',
      'settings update --section assessment --key enabled --value true --env prod --reason test --yes --json',
      'settings update --section display --key hideVersionBadge --value true --env prod --reason test --yes --json',
      'tutor sessions list --env prod --json',
      'link status --env prod --json',
    ]) {
      const res = await execCli(cmd, deps);
      expect(res.exitCode).toBe(4);
      expect(res.stdout).toBe('');
      expect(res.stderr).toContain('UPSKII_ENDPOINT_UNAVAILABLE');
      expect(res.stderr).toContain('not available on');
    }

    // Explicit --env prod on status link-readiness must not read saved Tuturuuu CLI config.
    let readConfigCalls = 0;
    const linkReadiness = await execCli(
      'status link-readiness --env prod --json',
      {
        credentialStore: store,
        fetch: async () => jsonResp({ enabled: true, link: null }),
        readConfig: async () => {
          readConfigCalls += 1;
          return { baseUrl: 'https://tuturuuu.com' };
        },
      }
    );
    expect(linkReadiness.exitCode).toBeUndefined();
    expect(readConfigCalls).toBe(0);
    expect(JSON.parse(linkReadiness.stdout)).toEqual({
      enabled: true,
      env: 'prod',
      link: null,
    });
  });
});
