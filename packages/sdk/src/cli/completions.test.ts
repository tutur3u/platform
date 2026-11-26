import { afterEach, describe, expect, it } from 'vitest';
import { CLI_EXIT, CliError } from './cli-contracts';
import {
  COMPLETION_SHELLS,
  completionsHelp,
  generateCompletions,
  runCompletionsCommand,
} from './completions';

const TOP_LEVEL = [
  'login',
  'logout',
  'whoami',
  'env',
  'doctor',
  'external',
  'infra',
  'db',
  'completions',
  'workspaces',
  'boards',
  'lists',
  'tasks',
  'projects',
  'labels',
  'devbox',
  'resources',
  'storage',
  'people',
  'employees',
  'feedback',
];

const GROUPS: Record<string, string[]> = {
  db: ['migrations', 'query', 'types', 'rls-check'],
  doctor: ['all', 'upskii', 'infra', 'db', 'local'],
  env: ['current', 'list', 'use'],
  infra: [
    'cloudflare',
    'workers',
    'deploys',
    'dns-readonly',
    'runners',
    'hosts',
    'packet',
  ],
  upskii: [
    'auth',
    'qa',
    'classes',
    'lessons',
    'link',
    'chat',
    'credits',
    'status',
    'workspaces',
    'settings',
    'assessments',
    'tutor',
    'accounts',
    'admin',
  ],
};

const FLAGS = [
  '--env',
  '--profile',
  '--json',
  '--jsonl',
  '--watch',
  '--yes',
  '--dry-run',
  '--confirm',
  '--reason',
  '--no-color',
  '--help',
];

function capture() {
  let out = '';
  let err = '';
  return {
    deps: {
      write: (chunk: string) => {
        out += chunk;
      },
      writeErr: (chunk: string) => {
        err += chunk;
      },
    },
    err: () => err,
    out: () => out,
  };
}

describe('ttr completions', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('exports the three shells', () => {
    expect(COMPLETION_SHELLS).toEqual(['zsh', 'bash', 'fish']);
  });

  it.each(COMPLETION_SHELLS)('covers commands and flags for %s', (shell) => {
    const script = generateCompletions(shell);
    expect(script.endsWith('\n')).toBe(true);
    expect(script).not.toMatch(/\.zshrc|\.bashrc|config\.fish|>>|curl |wget /u);
    for (const name of TOP_LEVEL) expect(script).toContain(name);
    for (const names of Object.values(GROUPS)) {
      for (const name of names) expect(script).toContain(name);
    }
    for (const flag of FLAGS) expect(script).toContain(flag);
    for (const shellName of COMPLETION_SHELLS)
      expect(script).toContain(shellName);
  });

  it('is syntactically shaped for each shell', () => {
    const zsh = generateCompletions('zsh');
    expect(zsh).toContain('#compdef ttr tuturuuu tutur3u');
    expect(zsh).toContain('compdef _ttr ttr tuturuuu tutur3u');
    expect(zsh).toContain('compadd');

    const bash = generateCompletions('bash');
    expect(bash).toContain('_ttr_completions()');
    expect(bash).toContain('complete -F _ttr_completions ttr');
    expect(bash).toContain('COMPREPLY=()');

    const fish = generateCompletions('fish');
    for (const line of fish.split('\n')) {
      if (line.trim() === '') continue;
      expect(line.startsWith('#') || line.startsWith('complete ')).toBe(true);
    }
    expect(fish).toContain('__fish_seen_subcommand_from upskii');
  });

  it('prints JSON { shell, script } without writing a file', async () => {
    const io = capture();
    await runCompletionsCommand(['bash', '--json'], io.deps);
    expect(process.exitCode).toBeUndefined();
    expect(JSON.parse(io.out())).toEqual({
      script: generateCompletions('bash'),
      shell: 'bash',
    });
    expect(io.err()).toBe('');
  });

  it('prints help and does not require a shell', async () => {
    const io = capture();
    await runCompletionsCommand(['--help'], io.deps);
    expect(io.out().trim()).toBe(completionsHelp());
    expect(io.out()).toContain('stdout');
    expect(io.out()).toContain('never');
    expect(process.exitCode).toBeUndefined();
  });

  it('rejects an unknown shell with CLI_EXIT.usage', async () => {
    const io = capture();
    expect(() => generateCompletions('powershell')).toThrow(CliError);
    try {
      generateCompletions('powershell');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).exitCode).toBe(CLI_EXIT.usage);
    }
    await runCompletionsCommand(['secret-shell-input-xyz'], io.deps);
    expect(process.exitCode).toBe(CLI_EXIT.usage);
    expect(io.out()).toBe('');
    expect(io.err()).toContain('UNKNOWN_COMPLETION_SHELL');
    expect(io.err()).not.toContain('secret-shell-input-xyz');
  });

  it('refuses --install and secret flags without echoing the secret', async () => {
    const install = capture();
    await runCompletionsCommand(['zsh', '--install'], install.deps);
    expect(process.exitCode).toBe(CLI_EXIT.policy);
    expect(install.out()).toBe('');
    expect(install.err()).toContain('COMPLETIONS_INSTALL_REFUSED');

    process.exitCode = undefined;
    const secret = capture();
    await runCompletionsCommand(
      ['zsh', '--token', 'super-secret-value'],
      secret.deps
    );
    expect(process.exitCode).toBe(CLI_EXIT.policy);
    expect(secret.out()).not.toContain('super-secret-value');
    expect(secret.err()).not.toContain('super-secret-value');
  });
});
