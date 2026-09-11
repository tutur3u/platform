import { availableParallelism, totalmem } from 'node:os';
import { basename, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  commandCwd,
  isHeavyCommand,
  limitCommand,
  realExecutable,
} from './resources-command';
import {
  atomicJson,
  defaultResourceConfig,
  readResourceConfig,
  resourceEnvironment,
  resourceHome,
  resourceScope,
} from './resources-config';
import { resourceSnapshot } from './resources-diagnostics';
import {
  hasResourceOwner,
  queuedResourceCommand,
  resourceQueueStatus,
  spawnResourceCommand,
} from './resources-queue';
import {
  installResourceShims,
  setupResources,
  uninstallResources,
} from './resources-setup';

export function resourcesHelp() {
  return `ttr resources — keep concurrent local work responsive\n
Usage: ttr resources <setup|status|monitor|run|enable|disable|uninstall> [options]

  setup --root <path>     opt in a project and its Git worktrees (repeat --root)
  status [--json]         show machine capacity, limits, owner and waiting jobs
  monitor --seconds 60   capture memory/process samples every 5 seconds (JSONL)
  run -- COMMAND ARGS    queue any finite command; no login or setup required
  enable | disable       toggle automatic admission for future commands
  uninstall              remove owned shell hooks/shims; preserve backups

Setup options:
  --shell zsh|bash|none   shell hooks; defaults to the current shell
  --workers <1..64>       Vitest/Cargo workers; default adapts to RAM and CPUs
  --dry-run              inspect the setup plan without writing files
  --json                 machine-readable setup/status output
Run option: --ignore-pressure skips only pressure admission for a deliberate small job.

One validation job runs per user across all opted-in projects/worktrees.
Turbo runs one task; Vitest and Cargo get bounded worker counts. Commands
outside those projects are unchanged. Running processes are never interrupted.
macOS/Linux supported. Shell hooks cover new shells, not existing processes.
Use TTR_RESOURCES_BYPASS=1 for a deliberate one-command opt-out.
Use TTR_RESOURCES_HOME to select a separate config/queue (primarily for tests).

Examples:
  ttr resources setup --root ~/code/project --shell zsh
  ttr resources run -- bun run test
  ttr resources run -- bun run build
  ttr resources status --json

For remote validation use ttr box run --runner <remote-id> -- COMMAND.
Verify that the runner is on another machine; local CI runners still use RAM.
`;
}

export async function runResourcesCommand(argv: string[]) {
  const divider = argv.indexOf('--');
  const options = divider < 0 ? argv : argv.slice(0, divider);
  const action = options[0] || 'status';
  if (
    options.includes('--help') ||
    options.includes('-h') ||
    action === 'help'
  ) {
    process.stdout.write(resourcesHelp());
    return;
  }
  const home = resourceHome();
  if (action === 'run' || action === 'shim') {
    const command = divider < 0 ? [] : argv.slice(divider + 1);
    const shim = action === 'shim';
    const name = shim ? options[1] : command.shift();
    if (!name) throw new Error('Use ttr resources run -- COMMAND [ARGS...].');
    const config = await readResourceConfig(home);
    const real = realExecutable(name, join(home, 'bin'));
    const enabled =
      process.env.TTR_RESOURCES_BYPASS !== '1' &&
      (!shim ||
        (config?.enabled && resourceScope(config, commandCwd(command))) ||
        (shim && (await hasResourceOwner(home))));
    const settings = config || defaultResourceConfig();
    const args = enabled
      ? limitCommand(basename(name), command, settings)
      : command;
    const env = enabled ? resourceEnvironment(settings) : { ...process.env };
    if (enabled && !shim) {
      const bin = await installResourceShims(home);
      env.PATH = `${bin}:${env.PATH || ''}`;
    }
    process.exitCode =
      enabled && (!shim || isHeavyCommand(name, command))
        ? await queuedResourceCommand(
            home,
            real,
            args,
            env,
            !shim && options.includes('--ignore-pressure')
          )
        : await spawnResourceCommand(real, args, env);
    return;
  }
  if (action === 'setup') {
    const roots: string[] = [];
    let shell = basename(process.env.SHELL || 'none');
    let workers: number | undefined;
    for (let i = 1; i < options.length; i++) {
      const arg = options[i]!;
      if (['--root', '--shell', '--workers'].includes(arg)) {
        const value = options[++i];
        if (!value || value.startsWith('--'))
          throw new Error(`Missing value for ${arg}.`);
        if (arg === '--root') roots.push(value);
        if (arg === '--shell') shell = value;
        if (arg === '--workers') workers = Number(value);
      } else if (!['--dry-run', '--json', '--no-update-check'].includes(arg))
        throw new Error(`Unknown setup option: ${arg}`);
    }
    const plan = await setupResources({
      home,
      roots,
      shell,
      workers,
      dryRun: options.includes('--dry-run'),
    });
    process.stdout.write(
      options.includes('--json')
        ? `${JSON.stringify(plan, null, 2)}\n`
        : `${options.includes('--dry-run') ? 'Planned' : 'Installed'} resource control: 1 job, ${plan.config.vitestWorkers} Vitest workers.\nProjects: ${plan.config.roots.join(', ')}\nShell hooks: ${plan.shellFiles.join(', ') || 'none'}\nOpen a new shell; existing jobs keep their current settings.\n`
    );
    return;
  }
  if (action === 'monitor') {
    const index = options.indexOf('--seconds');
    const seconds = index < 0 ? 60 : Number(options[index + 1]);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600)
      throw new Error('--seconds must be an integer from 1 to 3600.');
    const deadline = Date.now() + seconds * 1000;
    do {
      process.stdout.write(`${JSON.stringify(await resourceSnapshot())}\n`);
      if (Date.now() + 5000 >= deadline) break;
      await sleep(5000);
    } while (Date.now() < deadline);
    return;
  }
  if (action === 'status') {
    const config = await readResourceConfig(home);
    const state = await resourceQueueStatus(home);
    const result = {
      installed: Boolean(config),
      enabled: config?.enabled ?? false,
      home,
      machine: {
        platform: process.platform,
        memoryGiB: Math.round(totalmem() / 1024 ** 3),
        cpus: availableParallelism(),
      },
      limits: config || defaultResourceConfig(),
      ...state,
    };
    process.stdout.write(
      options.includes('--json')
        ? `${JSON.stringify(result, null, 2)}\n`
        : `${result.enabled ? 'Enabled' : 'Not enabled'}: ${result.machine.memoryGiB} GiB RAM, ${result.machine.cpus} CPUs\nLimits: 1 validation job, Turbo ${result.limits.turboConcurrency}, Vitest ${result.limits.vitestWorkers}\nRunning: ${state.owner ? `${state.owner.tool} (PID ${state.owner.pid}) in ${state.owner.cwd}` : 'none'}\nWaiting: ${state.waiting.length}\n`
    );
    return;
  }
  if (action === 'enable' || action === 'disable') {
    const config = await readResourceConfig(home);
    if (!config) throw new Error('Run ttr resources setup first.');
    await atomicJson(join(home, 'config.json'), {
      ...config,
      enabled: action === 'enable',
    });
    process.stdout.write(
      `Resource admission ${action}d for future commands.\n`
    );
    return;
  }
  if (action === 'uninstall') {
    await uninstallResources(home);
    process.stdout.write(
      'Resource hooks removed. Configuration and original shell backups preserved.\n'
    );
    return;
  }
  throw new Error(
    `Unknown resources action: ${action}. Use ttr resources --help.`
  );
}
