import { availableParallelism, totalmem } from 'node:os';
import { basename, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { evaluateTrustedRunner, fleetSnapshotNow } from '../devbox-fleet-types';
import { parseDurationSeconds } from './devbox-duration';
import {
  commandCwd,
  isHeavyCommand,
  limitCommand,
  realExecutable,
  trivialExecutable,
} from './resources-command';
import {
  atomicJson,
  defaultResourceConfig,
  hostLaneCeiling,
  laneResourceConfig,
  maxResourceLanes,
  readResourceConfig,
  resourceEnvironment,
  resourceHome,
  resourceLanes,
  resourceMaxLanes,
  resourceScope,
  type ValidationLanes,
} from './resources-config';
import { resourceSnapshot } from './resources-diagnostics';
import {
  hasResourceOwner,
  queuedResourceCommand,
  resourceQueueStatus,
  spawnResourceCommand,
} from './resources-queue';
import {
  installedResourceShims,
  setupResources,
  uninstallResources,
} from './resources-setup';
import { nestedOwner, withAdmission } from './resources-slots';
import {
  renderResourceStatus,
  resourceStatusDetails,
} from './resources-status';

export function resourcesHelp() {
  return `ttr resources — keep concurrent local work responsive\n
Usage: ttr resources <setup|status|monitor|run|hosts|enable|disable|uninstall> [options]

  setup --root <path>     opt in a project and its Git worktrees (repeat --root)
  status [--json]         show capacity, owners (command, age, CPU), waiters, idle warnings
  monitor --seconds 60   capture memory/process samples every 5 seconds (JSONL)
  run -- COMMAND ARGS    queue any finite command; explicit setup required
  offload [--json]       local saturation plus trusted devbox runner eligibility
  hosts [--json|--simulate] multi-host budgets, reservations, offline dry run
  enable | disable       toggle automatic admission for future commands
  uninstall              remove owned shell hooks/shims; preserve backups

Setup options:
  --shell zsh|bash|none   shell hooks; defaults to the current shell
  --lanes <1..8>          base lanes; default 1, change only when idle
  --max-lanes <1..8>      burst ceiling; default base, change only when idle
  --workers <1..64>       Vitest/Cargo workers; default adapts to RAM and CPUs
  --force                permit cross-install replacement only after draining
  --dry-run              inspect the setup plan without writing files
  --json                 machine-readable setup/status output
Run option: --ignore-pressure skips only pressure admission for a deliberate small job.
Run option: --offload auto|<runner-id> runs the exact pushed commit on a fresh,
attested trusted-development devbox runner (ttr box) when local lanes are
saturated (auto) or always (runner id). Dirty or unpushed trees are refused and
no local environment is sent. --timeout <30s|10m|2h> bounds it (default 30m).
ttr resources offload [--runner <id>] [--json] explains eligibility (blockedBy).
Run option: --hosts admits across hosts.json hosts (weighted light/heavy slots,
per-host budgets); off unless an operator installs hosts.json. Jobs are heavy
unless --class light is given.

One base lane is the default; opt in to burst lanes only after an idle migration.
Burst admission requires normal memory pressure and low CPU load, and stays
under a host lane ceiling (RAM/4 GiB, CPUs-2, at most 8). Each lane gets at
least one worker and at most its share of the configured worker totals.
All lanes share one per-user FIFO queue. Out-of-range config values are clamped
with a warning; an unreadable config makes shims run commands unmanaged.
Commands inside an admitted job (TTR_RESOURCES_ADMITTED, or a process-tree
ancestor holding a lane) run immediately instead of queueing again.
Only read-only system tools (cat, echo...) skip the queue; ls, git and runtimes queue.
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
  const allowed: Record<string, string[]> = {
    run: ['--ignore-pressure', '--offload', '--timeout', '--hosts', '--class'],
    hosts: ['--json', '--simulate'],
    offload: ['--json', '--runner'],
    shim: [],
    status: ['--json'],
    monitor: ['--seconds'],
    enable: [],
    disable: [],
    uninstall: [],
  };
  if (action !== 'setup' && allowed[action]) {
    const start = action === 'shim' ? 2 : 1;
    for (let i = start; i < options.length; i++) {
      const option = options[i]!;
      if (option === '--no-update-check') continue;
      if (!allowed[action]!.includes(option))
        throw new Error(`Unknown ${action} option: ${option}`);
      if (
        ['--seconds', '--offload', '--timeout', '--runner', '--class'].includes(
          option
        )
      ) {
        const value = options[++i];
        if (!value || value.startsWith('--'))
          throw new Error(`Missing value for ${option}.`);
      }
    }
  }
  const home = resourceHome();
  if (action === 'run' || action === 'shim') {
    const command = divider < 0 ? [] : argv.slice(divider + 1);
    const shim = action === 'shim';
    const name = shim ? options[1] : command.shift();
    if (!name) throw new Error('Use ttr resources run -- COMMAND [ARGS...].');
    const real = realExecutable(name, join(home, 'bin'));
    let config: Awaited<ReturnType<typeof readResourceConfig>>;
    try {
      config = await readResourceConfig(home);
    } catch (error) {
      // One bad config must not brick every tool behind the shared shims.
      if (!shim) throw error;
      process.stderr.write(
        `[ttr resources] ${error instanceof Error ? error.message : String(error)} Running ${basename(name)} without resource admission.\n`
      );
      process.exitCode = await spawnResourceCommand(real, command, {
        ...process.env,
      });
      return;
    }
    const enabled =
      process.env.TTR_RESOURCES_BYPASS !== '1' &&
      (!shim ||
        (config?.enabled && resourceScope(config, commandCwd(command))) ||
        (shim && (await hasResourceOwner(home))));
    const total = config || defaultResourceConfig();
    const caps = enabled ? laneResourceConfig(total) : total;
    const parent = enabled ? await nestedOwner(home) : undefined;
    const settings = parent?.limits ? { ...caps, ...parent.limits } : caps;
    const args = enabled
      ? limitCommand(basename(name), command, settings)
      : command;
    const env = enabled ? resourceEnvironment(settings) : { ...process.env };
    // Classify on the child's environment and spawn exactly the canonical
    // executable that was validated, never the swappable original name.
    const trivial = enabled && !shim ? trivialExecutable(name, env) : undefined;
    const queued =
      enabled && (shim ? isHeavyCommand(name, command) : trivial === undefined);
    const offload = optionValue(options, '--offload');
    if (!shim && queued && offload && !parent) {
      const code = await offloadRun({
        home,
        lanes: resourceLanes(total),
        target: offload,
        argv: [name, ...command],
        timeout: optionValue(options, '--timeout'),
      });
      if (code !== undefined) {
        process.exitCode = code;
        return;
      }
    }
    if (enabled && !shim) {
      const bin = await installedResourceShims(home);
      env.PATH = `${bin}:${env.PATH || ''}`;
    }
    if (!shim && queued && !parent && options.includes('--hosts')) {
      if (offload) throw new Error('Use --hosts or --offload, not both.');
      const { hostsRun } = await import('./resources-hosts-dispatch.js');
      const { hostsDependencies, hostsJobClass } = await import(
        './resources-hosts-cli.js'
      );
      const jobClass = hostsJobClass(optionValue(options, '--class'));
      const timeout = optionValue(options, '--timeout');
      process.exitCode = await hostsRun({
        home,
        command: name,
        args: command,
        jobClass,
        deps: hostsDependencies({
          home,
          name,
          real,
          command,
          env,
          timeoutSeconds: timeout ? parseDurationSeconds(timeout) : undefined,
          ignorePressure: options.includes('--ignore-pressure'),
        }),
      });
      return;
    }
    process.exitCode = queued
      ? await queuedResourceCommand(
          home,
          real,
          command,
          env,
          !shim && options.includes('--ignore-pressure'),
          resourceLanes(total)
        )
      : await spawnResourceCommand(trivial ?? real, args, env);
    return;
  }
  if (action === 'offload') {
    const box = await import('./resources-box-offload.js');
    const config = await readResourceConfig(home);
    const state = await resourceQueueStatus(
      home,
      resourceLanes(config || defaultResourceConfig())
    );
    const snapshot = await (
      await box.createSessionClient()
    ).devboxes.fleet.snapshot();
    const result = {
      local: {
        saturated:
          state.occupied >= state.effectiveLanes || state.waiting.length > 0,
        occupied: state.occupied,
        effectiveLanes: state.effectiveLanes,
        waiting: state.waiting.length,
      },
      selection: box.selectOffloadRunner(
        snapshot,
        optionValue(options, '--runner') ?? 'auto'
      ),
      runners: snapshot.runners
        .filter((runner) => runner.status !== 'revoked')
        .map((runner) => ({
          id: runner.id,
          name: runner.name,
          ...evaluateTrustedRunner(runner, fleetSnapshotNow(snapshot)),
        })),
    };
    process.stdout.write(
      options.includes('--json')
        ? `${JSON.stringify(result, null, 2)}\n`
        : `Local: ${result.local.saturated ? 'saturated' : 'lanes available'} (${result.local.occupied}/${result.local.effectiveLanes}, ${result.local.waiting} waiting)\n${result.runners.map((runner) => `${runner.eligible ? 'eligible' : `blockedBy=${runner.blockedBy}`} ${runner.name} (${runner.id}): ${runner.reason}`).join('\n')}\n${'runner' in result.selection ? `Offload target: ${result.selection.runner.name}` : `Offload blockedBy=${result.selection.blockedBy}: ${result.selection.reason}`}\n`
    );
    return;
  }
  if (action === 'setup') {
    const roots: string[] = [];
    let shell = basename(process.env.SHELL || 'none');
    let workers: number | undefined;
    let lanes: ValidationLanes | undefined;
    let maxLanes: number | undefined;
    for (let i = 1; i < options.length; i++) {
      const arg = options[i]!;
      if (
        ['--root', '--shell', '--workers', '--lanes', '--max-lanes'].includes(
          arg
        )
      ) {
        const value = options[++i];
        if (!value || value.startsWith('--'))
          throw new Error(`Missing value for ${arg}.`);
        if (arg === '--root') roots.push(value);
        if (arg === '--shell') shell = value;
        if (arg === '--workers') workers = Number(value);
        if (arg === '--max-lanes') maxLanes = Number(value);
        if (arg === '--lanes') {
          if (!/^[1-8]$/.test(value))
            throw new Error(
              `--lanes must be an integer from 1 to ${maxResourceLanes}.`
            );
          lanes = Number(value);
        }
      } else if (
        !['--dry-run', '--force', '--json', '--no-update-check'].includes(arg)
      )
        throw new Error(`Unknown setup option: ${arg}`);
    }
    const plan = await setupResources({
      home,
      roots,
      shell,
      workers,
      lanes,
      maxLanes,
      dryRun: options.includes('--dry-run'),
      force: options.includes('--force'),
    });
    if (!plan) throw new Error('Resource setup was cancelled.');
    for (const replacement of plan.replacements) {
      process.stderr.write(
        `[ttr resources] ${options.includes('--dry-run') ? 'Would replace' : 'Replaced'} ${replacement.path}\nFrom: ${replacement.previous.trim()}\nTo: ${replacement.next.trim()}\n`
      );
    }
    process.stdout.write(
      options.includes('--json')
        ? `${JSON.stringify(plan, null, 2)}\n`
        : `${options.includes('--dry-run') ? 'Planned' : 'Installed'} resource control: ${resourceLanes(plan.config)} base lane(s), up to ${resourceMaxLanes(plan.config)} lane(s), ${plan.config.vitestWorkers} total Vitest workers.\nProjects: ${plan.config.roots.join(', ')}\nShell hooks: ${plan.shellFiles.join(', ') || 'none'}\nOpen a new shell; existing jobs keep their current settings.\n`
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
  if (action === 'hosts') {
    const { runHostsAction } = await import('./resources-hosts-cli.js');
    await runHostsAction(home, options);
    return;
  }
  if (action === 'status') {
    // Status must explain an unusable config instead of failing with it.
    let config: Awaited<ReturnType<typeof readResourceConfig>>;
    let configError: string | undefined;
    try {
      config = await readResourceConfig(home);
    } catch (error) {
      configError = error instanceof Error ? error.message : String(error);
    }
    const limits = config || defaultResourceConfig();
    // An invalid config's lane count is unknown: read every possible slot so
    // running owners are still reported instead of closing status.
    const state = await resourceQueueStatus(
      home,
      resourceLanes(limits),
      configError ? { ...limits, maxValidationLanes: maxResourceLanes } : limits
    );
    const ceiling = hostLaneCeiling();
    const configWarnings = [
      ...(configError
        ? [
            `${configError} Explicit runs fail and shims run without admission until it is fixed.`,
          ]
        : []),
      ...(config && !config.enabled
        ? [
            'Resource admission is disabled: shims run tools without queueing. Run `ttr resources enable` to restore it.',
          ]
        : []),
      ...(resourceLanes(limits) > ceiling
        ? [
            `validationLanes ${resourceLanes(limits)} exceeds this host's lane ceiling ${ceiling}; at most ${state.effectiveLanes} lane(s) are admitted.`,
          ]
        : []),
    ];
    const details = await resourceStatusDetails(state);
    const result = {
      installed: Boolean(config) || Boolean(configError),
      enabled: config?.enabled ?? false,
      config: configError
        ? { state: 'invalid', error: configError }
        : {
            state: !config
              ? 'missing'
              : config.enabled
                ? 'enabled'
                : 'disabled',
          },
      hostLaneCeiling: ceiling,
      home,
      machine: {
        platform: process.platform,
        memoryGiB: Math.round(totalmem() / 1024 ** 3),
        cpus: availableParallelism(),
      },
      limits,
      ...state,
      ...details,
      warnings: [...configWarnings, ...details.warnings],
    };
    process.stdout.write(
      options.includes('--json')
        ? `${JSON.stringify(result, null, 2)}\n`
        : renderResourceStatus(result)
    );
    // Still a failure for scripts: admission cannot work with this config.
    if (configError) {
      process.stderr.write(`[ttr resources] ${configError}\n`);
      process.exitCode = 1;
    }
    return;
  }
  if (action === 'enable' || action === 'disable') {
    await withAdmission(home, async () => {
      const config = await readResourceConfig(home);
      if (!config) throw new Error('Run ttr resources setup first.');
      await atomicJson(join(home, 'config.json'), {
        ...config,
        enabled: action === 'enable',
      });
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

function optionValue(options: string[], name: string) {
  const index = options.indexOf(name);
  return index < 0 ? undefined : options[index + 1];
}

// `--offload auto` offloads only when local lanes are saturated and falls back
// to the local queue when no eligible runner exists or the server rejected the
// run; `--offload <runner-id>` always targets that runner and fails instead of
// falling back. Once a remote run exists (or might exist) neither mode falls
// back: runBoxOffload stops it and returns a non-zero code instead.
export async function offloadRun({
  home,
  lanes,
  target,
  argv,
  timeout,
  cwd = process.cwd(),
  loadBox = () => import('./resources-box-offload.js'),
  queueStatus = resourceQueueStatus,
}: {
  home: string;
  lanes: number;
  target: string;
  argv: string[];
  timeout?: string;
  cwd?: string;
  loadBox?: () => Promise<typeof import('./resources-box-offload.js')>;
  queueStatus?: typeof resourceQueueStatus;
}) {
  const log = (text: string) =>
    process.stderr.write(`[ttr resources] ${text}\n`);
  const explicit = target !== 'auto';
  if (!explicit) {
    const state = await queueStatus(home, lanes);
    if (state.occupied < state.effectiveLanes && !state.waiting.length)
      return undefined;
  }
  const box = await loadBox();
  let creationStarted = false;
  try {
    const plan = box.offloadCommitPlan(cwd);
    const client = await box.createSessionClient();
    const selection = box.selectOffloadRunner(
      await box.offloadRequest((signal) =>
        client.devboxes.fleet.snapshot({ signal })
      ),
      target
    );
    if (!('runner' in selection)) {
      if (explicit)
        throw new Error(
          `Offload to ${target} is blocked (blockedBy=${selection.blockedBy}): ${selection.reason}`
        );
      log(
        `local lanes saturated; offload blockedBy=${selection.blockedBy}: ${selection.reason}. Queueing locally.`
      );
      return undefined;
    }
    creationStarted = true;
    return await box.runBoxOffload({
      client,
      runnerId: selection.runner.id,
      sha: plan.sha,
      prefix: plan.prefix,
      argv,
      timeoutSeconds:
        (timeout ? parseDurationSeconds(timeout) : undefined) ||
        box.defaultOffloadTimeoutSeconds,
    });
  } catch (error) {
    if (explicit) throw error;
    if (
      creationStarted &&
      !(error instanceof box.OffloadNotCreatedError && error.rejected)
    ) {
      log(
        `${error instanceof Error ? error.message : String(error)}. The run may exist remotely, so it is not repeated locally; check \`ttr box list\` and stop it with \`ttr box stop <run-id>\`.`
      );
      return 1;
    }
    log(
      `offload unavailable: ${error instanceof Error ? error.message : String(error)} Queueing locally.`
    );
    return undefined;
  }
}
