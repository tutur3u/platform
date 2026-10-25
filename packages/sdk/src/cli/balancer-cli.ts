import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  BalancerRequestError,
  type BalancerRun,
  balancerHostVerdict,
  isBalancerTerminal,
  parseRunRequest,
} from '@tuturuuu/devbox';
import {
  balancerTick,
  type ControllerDeps,
  cancelRun,
  consumeRunResult,
  probeFleet,
  reconcileRun,
} from './balancer-controller';
import { readBalancerRegistry } from './balancer-hosts';
import { BalancerLedger, balancerHome } from './balancer-ledger';
import { sshTransport, transportFor } from './balancer-transport';

const HELP = `Usage: ttr balancer <command>

  run [options] -- <argv...>   Request a run and follow it to a terminal state
      --sha <sha|main>         Exact commit on origin (default: origin main)
      --repo <owner/name>      Repository (default: tutur3u/platform)
      --cwd <dir>              Relative directory inside the checkout
      --replicas <n>           Distinct hosts to run on (default 1)
      --class <light|heavy>    Resource class (default heavy)
      --priority <0-9>         Higher places first (default 5)
      --purpose <name>         test, lint, typecheck, build, verify or review
      --timeout <seconds>      Per-run limit (default 1800)
      --host <id>              Only these hosts (repeatable)
      --exclude-host <id>      Never these hosts (repeatable)
      --thread <threadId>      Owning T3 thread
      --request-id <id>        Idempotency key (16-128 of A-Z a-z 0-9 _ -)
      --no-install             Skip the frozen dependency install
      --detach                 Submit and return without following
  status [requestId] [--json]  Show recorded runs
  probe [--json]               Probe hosts and show placement eligibility
  reconcile [runId]            Settle active or UNKNOWN runs from host records
  cancel <runId|requestId>     Cancel queued runs or stop placed runs
  consume <runId> --thread <id>  Record that a thread consumed a result
  log <runId>                  Show the tail of a run's host log

Hosts come from ~/.tuturuuu/balancer/hosts.json (0600). Runs execute in a
fresh checkout inside each host's own \`ttr resources run\` queue. A run whose
host stops answering becomes UNKNOWN and is never rescheduled.`;

function originMain(repo: string) {
  return new Promise<string>((done, reject) =>
    execFile(
      'git',
      ['ls-remote', `https://github.com/${repo}.git`, 'refs/heads/main'],
      { timeout: 30_000 },
      (error, stdout) => {
        const sha = /^([0-9a-f]{40})\s/u.exec(String(stdout))?.[1];
        if (error || !sha) reject(new Error(`Could not resolve ${repo} main.`));
        else done(sha);
      }
    )
  );
}

function parseRunArgs(args: string[]) {
  const separator = args.indexOf('--');
  if (separator < 0) throw new Error('Put the command after --.');
  const options = args.slice(0, separator);
  const command = args.slice(separator + 1);
  const values: Record<string, string> = {};
  const lists: Record<string, string[]> = { host: [], 'exclude-host': [] };
  const flags = new Set<string>();
  for (let i = 0; i < options.length; i++) {
    const name = options[i]!.replace(/^--/u, '');
    if (name === 'no-install' || name === 'detach' || name === 'json') {
      flags.add(name);
      continue;
    }
    const value = options[++i];
    if (value === undefined) throw new Error(`--${name} needs a value.`);
    if (name in lists) lists[name]!.push(value);
    else values[name] = value;
  }
  return { values, lists, flags, command };
}

const summary = (run: BalancerRun) => ({
  runId: run.runId,
  state: run.state,
  deviceId: run.deviceId ?? null,
  sourceId: run.sourceId,
  baseSha: run.source.baseSha,
  leaseId: run.lease?.leaseId ?? null,
  fence: run.lease?.fence ?? null,
  exitCode: run.result?.exitCode ?? null,
  resultId: run.result?.resultId ?? null,
  logSha256: run.result?.logSha256 ?? null,
  reason: run.history.at(-1)?.reason ?? run.blockedBy ?? null,
});
const line = (run: BalancerRun) => {
  const entry = summary(run);
  return `${entry.runId}  ${entry.state.padEnd(12)} ${String(entry.deviceId ?? '-').padEnd(10)} ${entry.exitCode ?? ''} ${entry.reason ?? ''}`.trimEnd();
};

async function deps(): Promise<ControllerDeps> {
  const home = balancerHome();
  const ssh = sshTransport();
  return {
    ledger: new BalancerLedger(home),
    registry: await readBalancerRegistry(home),
    transport: (host) => transportFor(host, home, ssh),
    log: (text) => process.stderr.write(`[ttr balancer] ${text}\n`),
  };
}

async function follow(context: ControllerDeps, requestId: string) {
  const failures = new Map<string, number>();
  const seen = new Map<string, number>();
  let interrupted = 0;
  let deadline = Number.POSITIVE_INFINITY;
  const onSignal = () => {
    interrupted++;
    if (interrupted > 1) {
      process.stderr.write(
        '[ttr balancer] leaving runs recorded; use `ttr balancer reconcile`.\n'
      );
      process.exit(130);
    }
    deadline = Date.now() + 120_000;
    void context.ledger
      .listRuns(requestId)
      .then((runs) =>
        Promise.all(runs.map((run) => cancelRun(context, run.runId)))
      );
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    for (;;) {
      const { blocked } = await balancerTick(context, failures);
      const runs = await context.ledger.listRuns(requestId);
      for (const run of runs)
        if (seen.get(run.runId) !== run.revision) {
          seen.set(run.runId, run.revision);
          process.stderr.write(
            `[ttr balancer] ${line(run)}${blocked[run.runId] ? ` (waiting: ${blocked[run.runId]})` : ''}\n`
          );
        }
      if (
        runs.every(
          (run) => isBalancerTerminal(run.state) || run.state === 'unknown'
        )
      )
        return runs;
      if (Date.now() > deadline) return runs;
      await sleep(3_000);
    }
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

export async function runBalancerCommand(args: string[]) {
  const [action = 'help', ...rest] = args;
  const json = rest.includes('--json');
  if (action === 'help' || action === '--help' || action === '-h') {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const context = await deps();
  if (action === 'run') {
    const { values, lists, flags, command } = parseRunArgs(rest);
    const repo = values.repo ?? 'tutur3u/platform';
    const sha =
      !values.sha || values.sha === 'main'
        ? await originMain(repo)
        : values.sha;
    let request: ReturnType<typeof parseRunRequest>;
    try {
      request = parseRunRequest({
        requestId:
          values['request-id'] ??
          `run-${new Date()
            .toISOString()
            .replace(/[^0-9]/gu, '')
            .slice(0, 14)}-${randomBytes(4).toString('hex')}`,
        requester: values.thread
          ? { kind: 't3-thread', threadId: values.thread }
          : { kind: 'user' },
        purpose: values.purpose ?? 'test',
        source: { repo, baseSha: sha },
        command,
        cwd: values.cwd ?? '',
        jobClass: values.class ?? 'heavy',
        priority: Number(values.priority ?? 5),
        replicas: Number(values.replicas ?? 1),
        timeoutSeconds: Number(values.timeout ?? 1800),
        install: !flags.has('no-install'),
        constraints: {
          ...(lists.host!.length ? { hosts: lists.host } : {}),
          ...(lists['exclude-host']!.length
            ? { excludeHosts: lists['exclude-host'] }
            : {}),
        },
      });
    } catch (error) {
      if (error instanceof BalancerRequestError) throw new Error(error.message);
      throw error;
    }
    const submitted = await context.ledger.submit(request);
    process.stderr.write(
      `[ttr balancer] ${submitted.created ? 'requested' : 'resumed'} ${request.requestId} at ${sha.slice(0, 12)}\n`
    );
    const runs = flags.has('detach')
      ? submitted.runs
      : await follow(context, request.requestId);
    process.stdout.write(
      `${JSON.stringify({ requestId: request.requestId, runs: runs.map(summary) }, null, 2)}\n`
    );
    if (!runs.every((run) => run.state === 'succeeded') && !flags.has('detach'))
      process.exitCode = 1;
    return;
  }
  if (action === 'status') {
    const requestId = rest.find((arg) => !arg.startsWith('--'));
    const runs = await context.ledger.listRuns(requestId);
    process.stdout.write(
      json
        ? `${JSON.stringify(runs, null, 2)}\n`
        : `${runs.map(line).join('\n') || 'No runs recorded.'}\n`
    );
    return;
  }
  if (action === 'probe') {
    const telemetry = await probeFleet(context);
    const now = Date.now();
    const rows = context.registry.hosts.map((host) => ({
      host: host.id,
      verdict: balancerHostVerdict(
        host,
        telemetry[host.id],
        now,
        context.registry.telemetryTtlSeconds * 1000
      ),
      telemetry: telemetry[host.id] ?? null,
    }));
    process.stdout.write(
      json
        ? `${JSON.stringify(rows, null, 2)}\n`
        : `${rows
            .map(({ host, verdict, telemetry: entry }) =>
              `${host.padEnd(10)} ${verdict.status.padEnd(9)} ${'reason' in verdict ? verdict.reason : ''}${entry?.queue ? ` lanes ${entry.queue.occupied}+${entry.queue.waiting}/${entry.queue.lanes}` : ''}`.trimEnd()
            )
            .join('\n')}\n`
    );
    return;
  }
  if (action === 'reconcile') {
    const target = rest.find((arg) => !arg.startsWith('--'));
    const runs = (await context.ledger.listRuns()).filter(
      (run) => !target || run.runId === target
    );
    for (const run of runs)
      process.stdout.write(`${line(await reconcileRun(context, run))}\n`);
    return;
  }
  if (action === 'cancel') {
    const target = rest[0];
    if (!target) throw new Error('Name a run or request to cancel.');
    const direct = await context.ledger.readRun(target).catch(() => undefined);
    const runs = direct ? [direct] : await context.ledger.listRuns(target);
    if (!runs.length) throw new Error(`No runs match ${target}.`);
    for (const run of runs)
      process.stdout.write(`${line(await cancelRun(context, run.runId))}\n`);
    return;
  }
  if (action === 'consume') {
    const threadIndex = rest.indexOf('--thread');
    const thread = threadIndex >= 0 ? rest[threadIndex + 1] : undefined;
    if (!rest[0] || !thread)
      throw new Error(
        'Usage: ttr balancer consume <runId> --thread <threadId>'
      );
    const outcome = await consumeRunResult(context.ledger, rest[0], thread);
    process.stdout.write(
      `${JSON.stringify({ alreadyConsumed: outcome.alreadyConsumed, ...summary(outcome.run) })}\n`
    );
    return;
  }
  if (action === 'log') {
    const run = rest[0] ? await context.ledger.readRun(rest[0]) : undefined;
    const host = context.registry.hosts.find(
      (entry) => entry.id === run?.deviceId
    );
    if (!run || !host) throw new Error('Name a placed run.');
    const reply = await context.transport(host).call(host, 'log', [run.runId]);
    if (!reply.ok) throw new Error(`Could not read the log: ${reply.error}`);
    process.stdout.write(String(reply.value.tail ?? ''));
    return;
  }
  throw new Error(
    `Unknown balancer command: ${action}. Run \`ttr balancer help\`.`
  );
}
