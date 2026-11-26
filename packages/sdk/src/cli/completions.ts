import { parseArgs } from './args';
import { CLI_EXIT, CliError } from './cli-contracts';
import { rejectSecretFlags } from './credential-store';
import { emitCliError } from './ui/errors';

export const COMPLETION_SHELLS = ['zsh', 'bash', 'fish'] as const;

export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

const BINS = ['ttr', 'tuturuuu', 'tutur3u'] as const;

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
] as const;

const ENV_ACTIONS = ['current', 'list', 'use'] as const;
const DOCTOR_FAMILIES = ['all', 'upskii', 'infra', 'db', 'local'] as const;
const UPSKII = [
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
] as const;
const INFRA = [
  'cloudflare',
  'workers',
  'deploys',
  'dns-readonly',
  'runners',
  'hosts',
  'packet',
] as const;
const DB = ['migrations', 'query', 'types', 'rls-check'] as const;
const ENV_VALUES = ['prod', 'staging', 'sandbox', 'local'] as const;
const GLOBAL_FLAGS = [
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
] as const;

export interface RunCompletionsCommandDeps {
  write?: (chunk: string) => void;
  writeErr?: (chunk: string) => void;
}

function joinWords(words: readonly string[]): string {
  return words.join(' ');
}

function scriptHeader(shell: CompletionShell): string {
  return [
    `# ttr completion script for ${shell}.`,
    '# Print-only. This script does not edit shell startup files.',
    `# flags: ${joinWords(GLOBAL_FLAGS)}`,
  ].join('\n');
}

function fishForBins(body: (bin: string) => string): string {
  return BINS.map(body).join('\n');
}

function zshScript(): string {
  return [
    `#compdef ${joinWords(BINS)}`,
    scriptHeader('zsh'),
    '_ttr() {',
    '  if [[ $words[CURRENT] == -* ]]; then',
    `    compadd -- ${joinWords(GLOBAL_FLAGS)}`,
    '    return',
    '  fi',
    '  if [[ $words[CURRENT-1] == --env || $words[CURRENT-1] == --family ]]; then',
    '    if [[ $words[CURRENT-1] == --family ]]; then',
    `      compadd ${joinWords(DOCTOR_FAMILIES)}`,
    '    else',
    `      compadd ${joinWords(ENV_VALUES)}`,
    '    fi',
    '    return',
    '  fi',
    '  case $words[2] in',
    `    env) compadd ${joinWords(ENV_ACTIONS)} ;;`,
    `    doctor) compadd ${joinWords(DOCTOR_FAMILIES)} ;;`,
    '    external)',
    '      if [[ $words[3] == upskii ]]; then',
    `        compadd ${joinWords(UPSKII)}`,
    '      else',
    '        compadd upskii',
    '      fi',
    '      ;;',
    `    infra) compadd ${joinWords(INFRA)} ;;`,
    `    db) compadd ${joinWords(DB)} ;;`,
    `    completions) compadd ${joinWords(COMPLETION_SHELLS)} ;;`,
    `    *) compadd ${joinWords(TOP_LEVEL)} ;;`,
    '  esac',
    '}',
    'if (( ${+functions[compdef]} )); then',
    `  compdef _ttr ${joinWords(BINS)}`,
    'fi',
    '',
  ].join('\n');
}

function bashScript(): string {
  return [
    scriptHeader('bash'),
    '_ttr_completions() {',
    '  local cur prev cmd sub word i',
    '  COMPREPLY=()',
    '  cur="${COMP_WORDS[COMP_CWORD]}"',
    '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
    `  local flags="${joinWords(GLOBAL_FLAGS)}"`,
    `  local commands="${joinWords(TOP_LEVEL)}"`,
    '  if [[ "${cur}" == -* ]]; then',
    '    COMPREPLY=( $(compgen -W "${flags}" -- "${cur}") )',
    '    return 0',
    '  fi',
    '  case "${prev}" in',
    `    --env) COMPREPLY=( $(compgen -W "${joinWords(ENV_VALUES)}" -- "\${cur}") ); return 0 ;;`,
    `    --family) COMPREPLY=( $(compgen -W "${joinWords(DOCTOR_FAMILIES)}" -- "\${cur}") ); return 0 ;;`,
    '  esac',
    '  cmd=""',
    '  sub=""',
    '  i=1',
    '  while [[ "${i}" -lt "${COMP_CWORD}" ]]; do',
    '    word="${COMP_WORDS[$i]}"',
    '    i=$((i + 1))',
    '    [[ "${word}" == -* ]] && continue',
    '    if [[ -z "${cmd}" ]]; then cmd="${word}"; continue; fi',
    '    if [[ -z "${sub}" ]]; then sub="${word}"; break; fi',
    '  done',
    '  case "${cmd}" in',
    `    env) COMPREPLY=( $(compgen -W "${joinWords(ENV_ACTIONS)}" -- "\${cur}") ) ;;`,
    `    doctor) COMPREPLY=( $(compgen -W "${joinWords(DOCTOR_FAMILIES)}" -- "\${cur}") ) ;;`,
    '    external)',
    '      if [[ "${sub}" == "upskii" ]]; then',
    `        COMPREPLY=( $(compgen -W "${joinWords(UPSKII)}" -- "\${cur}") )`,
    '      else',
    '        COMPREPLY=( $(compgen -W "upskii" -- "${cur}") )',
    '      fi',
    '      ;;',
    `    infra) COMPREPLY=( $(compgen -W "${joinWords(INFRA)}" -- "\${cur}") ) ;;`,
    `    db) COMPREPLY=( $(compgen -W "${joinWords(DB)}" -- "\${cur}") ) ;;`,
    `    completions) COMPREPLY=( $(compgen -W "${joinWords(COMPLETION_SHELLS)}" -- "\${cur}") ) ;;`,
    '    *) COMPREPLY=( $(compgen -W "${commands}" -- "${cur}") ) ;;',
    '  esac',
    '  return 0',
    '}',
    ...BINS.map((bin) => `complete -F _ttr_completions ${bin}`),
    '',
  ].join('\n');
}

function fishScript(): string {
  const rules: Array<readonly [string, string]> = [
    [
      `not __fish_seen_subcommand_from ${joinWords(TOP_LEVEL)}`,
      joinWords(TOP_LEVEL),
    ],
    ['__fish_seen_subcommand_from env', joinWords(ENV_ACTIONS)],
    ['__fish_seen_subcommand_from doctor', joinWords(DOCTOR_FAMILIES)],
    [
      '__fish_seen_subcommand_from external; and not __fish_seen_subcommand_from upskii',
      'upskii',
    ],
    ['__fish_seen_subcommand_from upskii', joinWords(UPSKII)],
    ['__fish_seen_subcommand_from infra', joinWords(INFRA)],
    ['__fish_seen_subcommand_from db', joinWords(DB)],
    ['__fish_seen_subcommand_from completions', joinWords(COMPLETION_SHELLS)],
    ['__fish_prev_arg_in --env', joinWords(ENV_VALUES)],
    ['__fish_prev_arg_in --family', joinWords(DOCTOR_FAMILIES)],
  ];
  const lines = [scriptHeader('fish')];
  for (const [condition, args] of rules) {
    lines.push(
      fishForBins(
        (bin) => `complete -c ${bin} -f -n '${condition}' -a '${args}'`
      )
    );
  }
  for (const flag of GLOBAL_FLAGS) {
    const name = flag.slice(2);
    const shortHelp = name === 'help' ? ' -s h' : '';
    lines.push(
      fishForBins(
        (bin) => `complete -c ${bin}${shortHelp} -l ${name} -d '${name}'`
      )
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function completionsHelp(): string {
  return [
    'ttr completions — print a shell completion script to stdout',
    '',
    'Usage:',
    '  ttr completions <zsh|bash|fish> [--json]',
    '  ttr completions --help',
    '',
    'Read-only: stdout only. It never edits shell startup files. --install is refused.',
    '',
    '  source <(ttr completions zsh)   # compinit must already be loaded',
    '  source <(ttr completions bash)',
    '  ttr completions fish | source',
    '',
    '--json prints { "shell", "script" }. --dry-run is a no-op.',
  ].join('\n');
}

export function generateCompletions(shell: string): string {
  switch (shell) {
    case 'zsh':
      return zshScript();
    case 'bash':
      return bashScript();
    case 'fish':
      return fishScript();
    default:
      throw new CliError({
        code: 'UNKNOWN_COMPLETION_SHELL',
        exitCode: CLI_EXIT.usage,
        hint: 'Use zsh, bash, or fish. Run `ttr completions --help`.',
        message: 'Unsupported completion shell. Use zsh, bash, or fish.',
      });
  }
}

function shellFromArgs(
  positionals: string[],
  jsonFlag: boolean | string | undefined
): string | undefined {
  const shell = positionals.find((word) => word !== 'help' && word !== '-h');
  if (shell) return shell.toLowerCase();
  if (typeof jsonFlag === 'string' && jsonFlag !== 'true') {
    return jsonFlag.toLowerCase();
  }
  return undefined;
}

export async function runCompletionsCommand(
  argv: string[],
  deps: RunCompletionsCommandDeps = {}
): Promise<void> {
  const write = deps.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(argv);
  const jsonFlag = flags.json;
  const json = jsonFlag === true || typeof jsonFlag === 'string';
  const noColor = flags['no-color'] === true;
  const wantsHelp =
    flags.help === true ||
    flags.h === true ||
    positionals.includes('help') ||
    positionals.includes('-h');

  try {
    rejectSecretFlags(flags);
    if (wantsHelp) {
      write(`${completionsHelp()}\n`);
      return;
    }
    if (Object.hasOwn(flags, 'install')) {
      throw new CliError({
        code: 'COMPLETIONS_INSTALL_REFUSED',
        exitCode: CLI_EXIT.policy,
        hint: 'Run `ttr completions <zsh|bash|fish>` and source the stdout yourself.',
        message: 'Completions are printed to stdout only.',
      });
    }
    const shell = shellFromArgs(positionals, jsonFlag as boolean | string);
    if (!shell) {
      throw new CliError({
        code: 'MISSING_COMPLETION_SHELL',
        exitCode: CLI_EXIT.usage,
        hint: 'Run `ttr completions --help`.',
        message: 'Missing completion shell. Use zsh, bash, or fish.',
      });
    }
    const script = generateCompletions(shell);
    if (json) {
      write(`${JSON.stringify({ script, shell }, null, 2)}\n`);
      return;
    }
    write(script);
  } catch (error) {
    process.exitCode = emitCliError(error, {
      json,
      noColor,
      writeErr: deps.writeErr,
    });
  }
}
