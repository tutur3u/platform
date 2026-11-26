import { describe, expect, it } from 'vitest';
import {
  formatPreflightSummary,
  parsePreflightArgs,
  type PreflightCliRunner,
  runUpskiiPreflight,
} from './preflight';

const MUTATING_TOKENS = new Set([
  'create',
  'delete',
  'disable',
  'join',
  'publish',
  'purge',
  'revoke-session',
  'seed',
  'set',
  'smoke',
  'sweep',
  'switch',
  'teardown',
  'unlink',
  'unpublish',
  'update',
]);

describe('parsePreflightArgs', () => {
  it('parses flags and env defaults and rejects unknown or empty options', () => {
    expect(
      parsePreflightArgs(
        [
          '--require-provisioner',
          '--json',
          '--teacher-session-file',
          '/tmp/t.json',
          '--student-session-file=/tmp/s.json',
        ],
        {}
      )
    ).toEqual({
      json: true,
      requireProvisioner: true,
      studentSessionFile: '/tmp/s.json',
      teacherSessionFile: '/tmp/t.json',
    });

    expect(
      parsePreflightArgs([], {
        UPSKII_PREFLIGHT_STUDENT_SESSION_FILE: '/tmp/env-s.json',
        UPSKII_PREFLIGHT_TEACHER_SESSION_FILE: '/tmp/env-t.json',
      })
    ).toEqual({
      json: false,
      requireProvisioner: false,
      studentSessionFile: '/tmp/env-s.json',
      teacherSessionFile: '/tmp/env-t.json',
    });

    expect(() => parsePreflightArgs(['--teacher-session-file'], {})).toThrow(
      /Invalid or missing path/
    );
    expect(() =>
      parsePreflightArgs(['--teacher-session-file=--env=staging'], {})
    ).toThrow(/Invalid or missing path/);
    expect(() =>
      parsePreflightArgs([], {
        UPSKII_PREFLIGHT_STUDENT_SESSION_FILE: '--env=staging',
      })
    ).toThrow(/Invalid or missing path/);
    expect(() =>
      parsePreflightArgs([], {
        UPSKII_PREFLIGHT_TEACHER_SESSION_FILE: '   ',
      })
    ).toThrow(/Invalid or missing path/);
    expect(() => parsePreflightArgs(['--unknown'], {})).toThrow(
      /Unknown preflight argument/
    );
  });
});

describe('runUpskiiPreflight', () => {
  it('runs doctor + health read-only and skips provisioner when optional and unset', async () => {
    const calls: Array<{
      args: readonly string[];
      env: Record<string, string | undefined>;
    }> = [];
    const runCli: PreflightCliRunner = async (args, env) => {
      calls.push({ args, env });
      if (args[0] === 'doctor') {
        return {
          durationMs: 12,
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({ ok: true }),
        };
      }
      return {
        durationMs: 25,
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          checks: [
            { name: 'app', ok: true, status: 200 },
            { name: 'auth', ok: true, status: 200 },
            { name: 'admin', ok: true, status: 200 },
          ],
          env: 'prod',
          ok: true,
        }),
      };
    };

    const report = await runUpskiiPreflight(
      { json: false, requireProvisioner: false },
      { env: { PATH: '/usr/bin' }, runCli }
    );

    expect(report.ok).toBe(true);
    expect(report.readOnly).toBe(true);
    expect(report.checks.map((c) => [c.name, c.status])).toEqual([
      ['doctor: upskii', 'pass'],
      ['status: health', 'pass'],
      ['status: provisioner', 'skip'],
    ]);
    for (const call of calls) {
      expect(call.args).toContain('--env');
      expect(call.args).toContain('prod');
      expect(call.args).toContain('--json');
      expect(call.args.some((token) => MUTATING_TOKENS.has(token))).toBe(false);
    }
  });

  it('fails fast on missing, mis-scoped, or closed provisioner before optional session probes', async () => {
    const called: string[] = [];
    const okHealthRunner: PreflightCliRunner = async (args) => {
      called.push(args.join(' '));
      if (args[0] === 'doctor') {
        return {
          durationMs: 5,
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({ ok: true }),
        };
      }
      if (args.includes('health')) {
        return {
          durationMs: 5,
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({ checks: [], ok: true }),
        };
      }
      return {
        durationMs: 15,
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          configured: true,
          ok: false,
          probed: true,
          status: 404,
          windowOpen: false,
        }),
      };
    };

    const missingToken = await runUpskiiPreflight(
      {
        json: false,
        requireProvisioner: true,
        studentSessionFile: '/tmp/student.json',
        teacherSessionFile: '/tmp/teacher.json',
      },
      { env: {}, runCli: okHealthRunner }
    );
    expect(missingToken.ok).toBe(false);
    expect(missingToken.checks).toHaveLength(3);
    expect(missingToken.checks[2]).toMatchObject({
      name: 'status: provisioner',
      status: 'fail',
    });
    expect(called.some((c) => c.includes('--session-file'))).toBe(false);

    // Unscoped or staging-bound legacy token must NEVER be promoted to prod.
    called.length = 0;
    const stagingBound = await runUpskiiPreflight(
      { json: false, requireProvisioner: false },
      {
        env: {
          UPSKII_QA_PROVISIONER_TOKEN: 'staging-secret-123456',
          UPSKII_QA_PROVISIONER_TOKEN_ENV: 'staging',
        },
        runCli: okHealthRunner,
      }
    );
    expect(stagingBound.ok).toBe(false);
    expect(stagingBound.checks[2]?.detail).toContain('bound to "staging"');
    expect(called.some((c) => c.includes('provisioner'))).toBe(false);

    called.length = 0;
    const closedWindow = await runUpskiiPreflight(
      {
        json: false,
        requireProvisioner: true,
        teacherSessionFile: '/tmp/teacher.json',
      },
      {
        env: { UPSKII_QA_PROVISIONER_TOKEN_PROD: 'prov-secret-value-123456' },
        runCli: okHealthRunner,
      }
    );
    expect(closedWindow.ok).toBe(false);
    expect(closedWindow.checks).toHaveLength(3);
    expect(closedWindow.checks[2]?.detail).toContain('HTTP 404');
    expect(called.some((c) => c.includes('--session-file'))).toBe(false);
  });

  it('scopes provisioner token strictly to the provisioner probe and redacts secret echoes', async () => {
    const secret = 'qa-provisioner-secret-987654';
    const seenEnvs: Array<{
      args: readonly string[];
      env: Record<string, string | undefined>;
    }> = [];
    const runCli: PreflightCliRunner = async (args, env) => {
      seenEnvs.push({ args, env });
      if (args.includes('provisioner')) {
        return {
          durationMs: 10,
          exitCode: 3,
          stderr: JSON.stringify({
            error: {
              code: 'UPSKII_AUTH_FAILED',
              message: `unexpected echo ${secret}`,
            },
          }),
          stdout: '',
        };
      }
      return {
        durationMs: 5,
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({ checks: [], ok: true }),
      };
    };

    const report = await runUpskiiPreflight(
      { json: false, requireProvisioner: true },
      {
        env: {
          PATH: '/usr/bin',
          TTR_UPSKII_ADMIN_TOKEN_PROD: 'never-forward-admin-secret',
          UPSKII_QA_PROVISIONER_TOKEN: secret,
          UPSKII_QA_PROVISIONER_TOKEN_ENV: 'prod',
        },
        runCli,
      }
    );

    expect(report.ok).toBe(false);
    expect(seenEnvs).toHaveLength(3);
    // Doctor and health never receive the provisioner or admin tokens.
    expect(seenEnvs[0]?.env.UPSKII_QA_PROVISIONER_TOKEN).toBeUndefined();
    expect(seenEnvs[0]?.env.UPSKII_QA_PROVISIONER_TOKEN_PROD).toBeUndefined();
    expect(seenEnvs[0]?.env.TTR_UPSKII_ADMIN_TOKEN_PROD).toBeUndefined();
    expect(seenEnvs[1]?.env.UPSKII_QA_PROVISIONER_TOKEN_PROD).toBeUndefined();
    // Only the provisioner probe receives the env-scoped token.
    expect(seenEnvs[2]?.env.UPSKII_QA_PROVISIONER_TOKEN_PROD).toBe(secret);
    expect(seenEnvs[2]?.env.UPSKII_QA_PROVISIONER_TOKEN).toBeUndefined();
    // Redaction strips any accidental secret echo from summaries.
    const formatted = formatPreflightSummary(report).join('\n');
    expect(formatted).not.toContain(secret);
    expect(formatted).toContain('[REDACTED]');
  });

  it('executes optional educator and learner read-only walkthrough checks and detects unresolved sessions', async () => {
    const calledCommands: string[] = [];
    const makeRunner =
      (resolved: boolean): PreflightCliRunner =>
      async (args) => {
        calledCommands.push(args.join(' '));
        if (args[0] === 'doctor' || args.includes('health')) {
          return {
            durationMs: 4,
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({ checks: [], ok: true }),
          };
        }
        if (args.includes('provisioner')) {
          return {
            durationMs: 6,
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({
              configured: true,
              ok: true,
              probed: true,
              status: 200,
              windowOpen: true,
            }),
          };
        }
        if (args.includes('profile')) {
          return {
            durationMs: 5,
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({ profile: { id: 'u-1' } }),
          };
        }
        if (args.includes('sessions')) {
          return {
            durationMs: 5,
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({
              count: 1,
              currentSessionResolved: resolved,
              sessions: [{ current: resolved ? true : null, id: 's-1' }],
            }),
          };
        }
        if (args.includes('workspaces')) {
          return {
            durationMs: 5,
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({
              d1Telemetry: {
                'x-upskii-d1-rows-read': '12',
                'x-upskii-d1-rows-written': '0',
              },
              workspaces: [],
            }),
          };
        }
        if (args.includes('classes')) {
          return {
            durationMs: 5,
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({ classes: [] }),
          };
        }
        if (args.includes('prompts')) {
          return {
            durationMs: 5,
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({ prompts: [] }),
          };
        }
        if (args.includes('models')) {
          return {
            durationMs: 5,
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({ models: [] }),
          };
        }
        if (args.includes('balance')) {
          return {
            durationMs: 5,
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({ remaining: 100 }),
          };
        }
        if (args.includes('link-readiness')) {
          return {
            durationMs: 5,
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({ enabled: true, env: 'prod', link: null }),
          };
        }
        throw new Error(`Unexpected command: ${args.join(' ')}`);
      };

    const green = await runUpskiiPreflight(
      {
        json: false,
        requireProvisioner: true,
        studentSessionFile: '/tmp/student.json',
        teacherSessionFile: '/tmp/teacher.json',
      },
      {
        env: { UPSKII_QA_PROVISIONER_TOKEN_PROD: 'prov-token-valid-123456' },
        runCli: makeRunner(true),
      }
    );
    expect(green.ok).toBe(true);
    expect(green.checks).toHaveLength(16);
    expect(
      calledCommands.every(
        (cmd) =>
          !cmd.includes('class-settings') &&
          !cmd.includes('link status') &&
          !cmd.split(' ').some((token) => MUTATING_TOKENS.has(token))
      )
    ).toBe(true);
    const sessionCalls = calledCommands.filter((cmd) =>
      cmd.includes('--session-file=')
    );
    expect(sessionCalls).toHaveLength(13);
    expect(calledCommands.some((cmd) => cmd.includes('--session-file '))).toBe(
      false
    );

    const unresolved = await runUpskiiPreflight(
      {
        json: false,
        requireProvisioner: false,
        teacherSessionFile: '/tmp/teacher.json',
      },
      { env: {}, runCli: makeRunner(false) }
    );
    expect(unresolved.ok).toBe(false);
    expect(
      unresolved.checks.find(
        (c) => c.name === 'teacher: accounts sessions list'
      )
    ).toMatchObject({
      detail: 'currentSessionResolved !== true',
      status: 'fail',
    });

    await expect(
      runUpskiiPreflight(
        {
          json: false,
          requireProvisioner: false,
          teacherSessionFile: '',
        },
        { env: {}, runCli: makeRunner(true) }
      )
    ).rejects.toThrow(/Invalid or missing path/);
  });
});
