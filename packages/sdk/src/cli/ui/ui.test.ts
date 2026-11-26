import { afterEach, describe, expect, it } from 'vitest';
import { CliError, type MutationPreview } from '../cli-contracts';
import { formatMutationPreview } from './diff';
import { emitCliError, formatCliError } from './errors';
import { formatTable } from './table';
import { createTheme, supportsColor } from './theme';
import { parseWatchInterval, runWatchLoop } from './watch';

const saved = {
  FORCE_COLOR: process.env.FORCE_COLOR,
  NO_COLOR: process.env.NO_COLOR,
};

afterEach(() => {
  for (const key of ['FORCE_COLOR', 'NO_COLOR'] as const) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function forceColor() {
  process.env.FORCE_COLOR = '1';
  delete process.env.NO_COLOR;
}

function sample(overrides: Partial<MutationPreview> = {}): MutationPreview {
  return {
    applyHint: 'ttr apply --id abc',
    changes: [{ after: 'new', before: 'old', field: 'name' }],
    confirmToken: 'tok-9',
    env: 'prod',
    origin: 'https://tuturuuu.com',
    target: 'workspace/1',
    tier: 2,
    title: 'Rename workspace',
    ...overrides,
  };
}

function expectInvalidInterval(raw: string) {
  let caught: unknown;
  try {
    parseWatchInterval(raw);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CliError);
  expect((caught as CliError).code).toBe('INVALID_WATCH_INTERVAL');
  expect((caught as CliError).exitCode).toBe(1);
}

describe('theme', () => {
  it('honors flags, NO_COLOR, dumb terminals, and TTY', () => {
    expect(
      supportsColor({ env: {}, forceColor: true, isTTY: true, noColor: true })
    ).toBe(false);
    expect(supportsColor({ env: {}, forceColor: true, isTTY: false })).toBe(
      true
    );
    expect(supportsColor({ env: {}, isTTY: false })).toBe(false);
    expect(supportsColor({ env: { NO_COLOR: '1' }, isTTY: true })).toBe(false);
    expect(supportsColor({ env: { TERM: 'dumb' }, isTTY: true })).toBe(false);
    expect(supportsColor({ env: { FORCE_COLOR: '0' }, isTTY: true })).toBe(
      false
    );
    expect(supportsColor({ env: {}, isTTY: true })).toBe(true);
  });

  it('paints badges and ignores ANSI in visible length', () => {
    const theme = createTheme({ forceColor: true });
    const plain = createTheme({ noColor: true });
    const red = theme.red('stop');

    expect(red).toBe('\u001B[31mstop\u001B[0m');
    expect(plain.red('stop')).toBe('stop');
    expect(theme.ok('ok')).toContain('\u001B[32m');
    expect(theme.warn('warn')).toContain('\u001B[33m');
    expect(theme.err('err')).toContain('\u001B[31m');
    expect(theme.info('info')).toContain('\u001B[36m');
    expect(theme.badge('ENV: PROD', 'prod')).toBe(
      '\u001B[1;31m[ENV: PROD]\u001B[0m'
    );
    expect(plain.badge('QUIET', 'muted')).toBe('[QUIET]');
    expect(theme.stripAnsi(red)).toBe('stop');
    expect(theme.visibleLength(red)).toBe(4);
  });
});

describe('formatTable', () => {
  it('colors an empty result and wraps, aligns, filters, and escapes', () => {
    expect(formatTable([], { noColor: true })).toBe('No results.\n');
    expect(
      formatTable([], { emptyMessage: 'Nothing to show.', noColor: true })
    ).toBe('Nothing to show.\n');
    forceColor();
    const colored = formatTable([]);
    expect(colored).toContain('\u001B[33m');
    expect(colored).toContain('\u001B[2m');
    expect(colored).toContain('No results.');

    const wrapped = formatTable([{ title: 'one two three four five six' }], {
      columns: [{ key: 'title', label: 'Title', minWidth: 4 }],
      maxWidth: 20,
      noColor: true,
    });
    const lines = wrapped.split('\n').filter((line) => line.length > 0);
    expect(lines.length).toBeGreaterThan(4);
    expect(wrapped).toContain('┌');
    expect(wrapped).toContain('six');
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(20);

    const aligned = formatTable([{ id: 'a', score: 7 }], {
      columns: [
        { key: 'id', label: 'ID' },
        { align: 'right', key: 'score', label: 'Score', minWidth: 5 },
      ],
      maxWidth: 80,
      noColor: true,
    });
    expect(aligned).toContain('┬');
    expect(aligned).toContain('┼');
    expect(aligned).toContain('┴');
    expect(aligned).toMatch(/│ +7 │/);

    const filtered = formatTable([{ id: 'u_1', name: 'Ada', role: 'admin' }], {
      fields: ['id', 'name'],
      maxWidth: 80,
      noColor: true,
    });
    expect(filtered).toContain('u_1');
    expect(filtered).toContain('Ada');
    expect(filtered).not.toContain('admin');
    expect(filtered).not.toContain('role');

    const escaped = formatTable([{ name: 'bad\u001B[2Jname' }], {
      maxWidth: 80,
      noColor: true,
    });
    expect(escaped).toContain('\\x1B[2Jname');
    expect(escaped).not.toContain('\u001B[2J');
    expect(
      formatTable([{ name: 'Ada' }], {
        columns: [{ key: 'name', label: 'Name' }],
        compact: true,
        maxWidth: 40,
        noColor: true,
      })
    ).toContain('│Name│');
    expect(
      formatTable([{ name: 'A' }], {
        columns: [{ key: 'name', label: 'Name' }],
        maxWidth: 30,
        noColor: true,
        wide: true,
      }).split('\n')[0]?.length
    ).toBe(30);
  });
});

describe('formatMutationPreview', () => {
  it('renders the prod badge, diff, exact hint, and tier 2 token', () => {
    const text = formatMutationPreview(sample(), { noColor: true });
    expect(text).toContain('[ENV: PROD]');
    expect(text).toContain('Target: workspace/1');
    expect(text).toContain('Origin: https://tuturuuu.com');
    expect(text).toContain('[TIER 2]');
    expect(text).toContain('- old');
    expect(text).toContain('+ new');
    expect(text).toContain('ttr apply --id abc');
    expect(text).toContain('Confirm token: tok-9');
    expect(text).toContain('tier 2');

    forceColor();
    const colored = formatMutationPreview(sample());
    expect(colored).toContain('\u001B[1;31m[ENV: PROD]\u001B[0m');
    expect(colored).toContain('\u001B[31m- old\u001B[0m');
    expect(colored).toContain('\u001B[32m+ new\u001B[0m');
  });

  it('omits the prod warning for tier 1 and returns pretty JSON', () => {
    const text = formatMutationPreview(
      sample({ confirmToken: 'hidden', env: 'staging', tier: 1 }),
      { noColor: true }
    );
    expect(text).toContain('[ENV: STAGING]');
    expect(text).toContain('[TIER 1]');
    expect(text).not.toContain('[ENV: PROD]');
    expect(text).not.toContain('hidden');
    expect(text).not.toContain('tier 2');

    const raw = sample();
    const json = formatMutationPreview(raw, { json: true });
    expect(JSON.parse(json)).toEqual({ applied: false, preview: raw });
    expect(json.startsWith('{\n')).toBe(true);
  });
});

describe('watch loop', () => {
  it('parses 10..3600 and rejects anything else', () => {
    expect(parseWatchInterval()).toBe(0);
    expect(parseWatchInterval(false)).toBe(0);
    expect(parseWatchInterval('')).toBe(0);
    expect(parseWatchInterval(true)).toBe(10);
    expect(parseWatchInterval(true, 15)).toBe(15);
    expect(parseWatchInterval('10')).toBe(10);
    expect(parseWatchInterval(' 3600 ')).toBe(3600);
    for (const raw of ['9', '3601', '10.5', 'nope']) expectInvalidInterval(raw);
  });

  it('emits NDJSON, clears a TTY, and stops at maxIterations', async () => {
    const lines: string[] = [];
    const sleeps: number[] = [];
    await runWatchLoop({
      fetch: async (ctx) => ({ n: ctx.attempt }),
      intervalSeconds: 10,
      isTTY: false,
      jsonl: true,
      maxIterations: 2,
      renderHuman: () => 'unused',
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      write: (chunk) => lines.push(chunk),
    });
    expect(sleeps).toEqual([10_000]);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      attempt: 1,
      data: { n: 1 },
    });
    expect(lines[0]?.endsWith('\n')).toBe(true);
    expect(String(JSON.parse(lines[0] ?? '').observedAt)).toContain('T');

    const chunks: string[] = [];
    await runWatchLoop({
      fetch: async () => 'ok',
      intervalSeconds: 30,
      isTTY: true,
      maxIterations: 1,
      renderHuman: (data) => `body ${data}`,
      sleep: async () => {
        throw new Error('sleep should not run after the last tick');
      },
      title: 'Pods',
      write: (chunk) => chunks.push(chunk),
    });
    const output = chunks.join('');
    expect(output).toContain('\u001B[2J\u001B[H');
    expect(output).toContain('Pods');
    expect(output).toContain('every 30s');
    expect(output).toContain('body ok');
  });

  it('backs off twice, then throws, and survives fewer failures', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await expect(
      runWatchLoop({
        fetch: async () => {
          calls += 1;
          throw new Error('temporary');
        },
        intervalSeconds: 10,
        isTTY: false,
        json: true,
        maxIterations: 10,
        renderHuman: () => '',
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        write: () => {},
      })
    ).rejects.toThrow('temporary');
    expect(calls).toBe(3);
    expect(sleeps).toEqual([10_000, 20_000]);

    calls = 0;
    const lines: string[] = [];
    await runWatchLoop({
      fetch: async () => {
        calls += 1;
        if (calls < 3) throw new Error('temporary');
        return { ok: true };
      },
      intervalSeconds: 10,
      isTTY: false,
      json: true,
      maxIterations: 3,
      renderHuman: () => '',
      sleep: async () => {},
      write: (chunk) => lines.push(chunk),
    });
    expect(calls).toBe(3);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      attempt: 3,
      data: { ok: true },
    });
  });

  it('stops on abort and removes the SIGINT handler', async () => {
    const controller = new AbortController();
    let fetches = 0;
    await runWatchLoop({
      fetch: async () => {
        fetches += 1;
        return 1;
      },
      intervalSeconds: 10,
      isTTY: false,
      maxIterations: 5,
      renderHuman: () => '',
      signal: controller.signal,
      sleep: async (_ms, signal) => {
        controller.abort();
        expect(signal.aborted).toBe(true);
      },
      write: () => {},
    });
    expect(fetches).toBe(1);

    const before = process.listenerCount('SIGINT');
    const live = new AbortController();
    await runWatchLoop({
      fetch: async () => {
        expect(process.listenerCount('SIGINT')).toBe(before + 1);
        live.abort();
        return 'x';
      },
      intervalSeconds: 10,
      isTTY: false,
      renderHuman: () => '',
      signal: live.signal,
      sleep: async () => {},
      write: () => {},
    });
    expect(process.listenerCount('SIGINT')).toBe(before);
  });
});

describe('cli errors', () => {
  it('writes JSON errors to stderr and formats human text', () => {
    const error = new CliError({
      code: 'NOPE',
      docsUrl: 'https://tuturuuu.com/docs/cli',
      exitCode: 4,
      hint: 'try\u001B[2Jagain',
      message: 'missing\nname',
      requestId: 'req-1',
    });
    const json = formatCliError(error, { json: true });
    expect(json.exitCode).toBe(4);
    expect(JSON.parse(json.output)).toEqual({
      error: {
        code: 'NOPE',
        hint: 'try\u001B[2Jagain',
        message: 'missing\nname',
        requestId: 'req-1',
      },
      ok: false,
    });

    let stderr = '';
    let stdout = '';
    expect(
      emitCliError(error, {
        json: true,
        writeErr: (chunk) => {
          stderr += chunk;
        },
        writeOut: (chunk) => {
          stdout += chunk;
        },
      })
    ).toBe(4);
    expect(stderr).toBe(json.output);
    expect(stdout).toBe('');

    const human = formatCliError(error, { noColor: true });
    expect(human.output).toContain('error: missing\\nname');
    expect(human.output).toContain('code: NOPE');
    expect(human.output).toContain('hint: try\\x1B[2Jagain');
    expect(human.output).toContain('request: req-1');
    expect(human.output).toContain('docs: https://tuturuuu.com/docs/cli');
    expect(human.output).not.toContain('\u001B');

    forceColor();
    expect(formatCliError(error).output).toContain('\u001B[31merror:\u001B[0m');
    const unknown = formatCliError('plain', { json: true });
    expect(unknown.exitCode).toBe(1);
    expect(JSON.parse(unknown.output)).toEqual({
      error: { code: 'INTERNAL', message: 'plain' },
      ok: false,
    });
  });
});
