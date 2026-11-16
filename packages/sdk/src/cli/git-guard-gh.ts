import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import {
  gitGuardHome,
  isGuardedRepo,
  readGitGuardConfig,
  repoSlugFromRemote,
} from './git-guard-config';
import { appendGuardLog, consumeOverride } from './git-guard-log';

export interface GhClassification {
  createsPr: boolean;
  /** How the PR would be created, for the refusal message and log. */
  via?: 'pr create' | 'api rest' | 'api graphql' | 'stack submit';
  /** Explicit repo from -R/--repo or the REST path, when present. */
  explicitRepo?: string | null;
  head?: string;
}

const FIELD_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input']);

function flagValue(argv: string[], names: string[]) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    for (const name of names) {
      if (arg === name) return argv[index + 1];
      if (name.startsWith('--') && arg.startsWith(`${name}=`))
        return arg.slice(name.length + 1);
    }
  }
  return undefined;
}

const positionalsOf = (argv: string[]) => {
  // Flags that consume a value, so their values are not read as commands.
  const valued = new Set([
    '-R',
    '--repo',
    '-X',
    '--method',
    '-H',
    '--header',
    '--hostname',
    '-f',
    '-F',
    '--field',
    '--raw-field',
    '--input',
    '-q',
    '--jq',
    '-t',
    '--template',
  ]);
  const result: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--') {
      result.push(...argv.slice(index + 1));
      break;
    }
    if (arg.startsWith('-')) {
      if (valued.has(arg)) index += 1;
      continue;
    }
    result.push(arg);
  }
  return result;
};

function readInputFile(path: string | undefined) {
  if (!path || path === '-' || !existsSync(path)) return '';
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/** Classify a gh invocation without running it. */
export function classifyGh(argv: string[]): GhClassification {
  const positionals = positionalsOf(argv);
  const [command, sub] = positionals;
  const explicitRepo = repoSlugFromRemote(flagValue(argv, ['-R', '--repo']));
  if (command === 'pr' && (sub === 'create' || sub === 'new'))
    return {
      createsPr: true,
      via: 'pr create',
      explicitRepo,
      head: flagValue(argv, ['-H', '--head']),
    };
  if (command === 'stack' && (sub === 'submit' || sub === 'push'))
    return { createsPr: true, via: 'stack submit', explicitRepo };
  if (command !== 'api' || !sub) return { createsPr: false };

  const method = (flagValue(argv, ['-X', '--method']) ?? '').toUpperCase();
  const hasFields = argv.some(
    (arg) =>
      FIELD_FLAGS.has(arg) ||
      [...FIELD_FLAGS].some(
        (flag) => flag.startsWith('--') && arg.startsWith(`${flag}=`)
      )
  );
  if (sub === 'graphql') {
    const body = `${argv.join(' ')} ${readInputFile(flagValue(argv, ['--input']))}`;
    return /createPullRequest/u.test(body)
      ? { createsPr: true, via: 'api graphql', explicitRepo }
      : { createsPr: false };
  }
  const effective = method || (hasFields ? 'POST' : 'GET');
  const path = sub.replace(/^\/+/u, '').split('?')[0]!;
  const match = /^repos\/([^/]+)\/([^/]+)\/pulls\/?$/u.exec(path);
  if (effective === 'POST' && match) {
    const pathRepo = match[1]!.startsWith('{')
      ? null
      : `${match[1]}/${match[2]}`.toLowerCase();
    return {
      createsPr: true,
      via: 'api rest',
      explicitRepo: pathRepo ?? explicitRepo,
    };
  }
  return { createsPr: false };
}

export function cwdRemoteSlugs(cwd: string) {
  const output = spawnSync('git', ['remote', '-v'], {
    cwd,
    encoding: 'utf8',
  });
  if (output.status !== 0) return [];
  const slugs = new Set<string>();
  for (const line of output.stdout.split('\n')) {
    const url = line.split(/\s+/u)[1];
    const slug = repoSlugFromRemote(url);
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

/**
 * Decide whether a gh invocation may run. Returns `null` when allowed, or the
 * guarded repo that refused it. GraphQL mutations name a repository id, not a
 * slug, so a GraphQL PR creation without an explicit repo is checked against
 * every remote of the working directory and refused when the repo is unknown.
 */
export async function checkGhInvocation(options: {
  argv: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
  remotes?: string[];
  stderr?: (text: string) => void;
}) {
  const home = options.home ?? gitGuardHome();
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const stderr = options.stderr ?? ((text) => process.stderr.write(text));
  const config = await readGitGuardConfig(home);
  if (!config?.enabled) return null;
  const classification = classifyGh(options.argv);
  if (!classification.createsPr) return null;

  const explicit =
    classification.explicitRepo ?? repoSlugFromRemote(env.GH_REPO);
  const candidates = explicit
    ? [explicit]
    : (options.remotes ?? cwdRemoteSlugs(cwd));
  const unknown =
    !candidates.length && classification.via === 'api graphql'
      ? ['unknown']
      : [];
  const guarded = [
    ...candidates.filter((slug) => isGuardedRepo(config, slug)),
    ...unknown,
  ];
  if (!guarded.length) return null;
  const repo = guarded[0]!;
  const ref = classification.head ?? '*';
  const override = await consumeOverride(
    { kind: 'pr', repo, ref },
    { machine: config.machine, cwd },
    home
  );
  if (override) {
    stderr(
      `ttr git guard: PR creation on ${repo} allowed once by override ${override.id} (approved by ${override.approvedBy}: ${override.reason}).\n`
    );
    return null;
  }
  await appendGuardLog(
    {
      event: 'refused',
      kind: 'pr',
      machine: config.machine,
      repo,
      ref,
      code: classification.via,
      cwd,
    },
    home
  );
  stderr(
    [
      `ttr git guard: pull request creation (${classification.via}) on ${repo} refused on ${config.machine}.`,
      'This repository takes no pull requests. Review locally and push',
      'fast-forward to main (`git push origin HEAD:main`), then `bun git-sync`.',
      'A real exception (release-please, dependabot, a USER-approved stack)',
      'needs an explicit, logged, single-use override:',
      `  ttr git guard allow-once --kind pr --repo ${repo} --reason "<why>" --approved-by <who>`,
      '',
    ].join('\n')
  );
  return repo;
}
