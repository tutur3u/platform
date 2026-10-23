import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { collectChildren } from './collectors/children';

export interface ProcessMetadata {
  pid: number;
  ppid: number;
  command: string;
}

export function parseWatcherPids(contents: string): number[] {
  const values = contents.split(/\s+/).filter(Boolean).map(Number);
  if (
    !values.length ||
    values.some((pid) => !Number.isSafeInteger(pid) || pid <= 0)
  )
    throw new Error('watcher-pids-invalid');
  return [...new Set(values)];
}

export function checkpointDecision(
  threadId: string,
  snapshot: ReturnType<typeof collectChildren>,
  watcherPids: number[],
  processes: ProcessMetadata[]
) {
  const thread = snapshot.threads.find((item) => item.id === threadId);
  if (!thread) throw new Error('checkpoint-thread-unavailable');
  const queue = snapshot.runs.filter(
    (run) => run.threadId === threadId && run.status === 'queued'
  );
  const activeRuns = snapshot.runs.filter(
    (run) =>
      run.threadId === threadId &&
      ['running', 'starting', 'preparing', 'waiting'].includes(run.status)
  );
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  const missingPids = watcherPids.filter((pid) => !byPid.has(pid));
  const mergePids = processes
    .filter(
      (process) =>
        /(?:^|\/)gh(?:\s|$)/.test(process.command) &&
        /\bpr\s+merge\b/.test(process.command)
    )
    .map((process) => process.pid);
  const reasons = [
    ...(!queue.length ? [] : ['queue-not-empty']),
    ...(thread.activeWriterNodes === 0 && activeRuns.length === 0
      ? []
      : ['writer-not-drained']),
    ...(missingPids.length ? ['watcher-process-state-unknown'] : []),
    ...(mergePids.length ? ['gh-pr-merge-in-flight'] : []),
  ];
  return {
    result: reasons.length ? 'no-go' : 'go',
    threadId,
    queuedRuns: queue.length,
    activeRuns: activeRuns.length,
    activeWriterNodes: thread.activeWriterNodes,
    watcherPids: watcherPids.length,
    missingWatcherPids: missingPids,
    mergePids,
    reasons,
  };
}

function readProcessMetadata(): ProcessMetadata[] {
  const result = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,command='], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error)
    throw new Error('process-list-unavailable');
  return result.stdout
    .split('\n')
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      return match
        ? { pid: Number(match[1]), ppid: Number(match[2]), command: match[3]! }
        : undefined;
    })
    .filter((item): item is ProcessMetadata => item !== undefined);
}

export function runCheckpointReady(args: string[]) {
  try {
    const threadId = valueAfter(args, '--thread');
    const pidPath = valueAfter(args, '--watcher-pids-file');
    if (!threadId || !pidPath) throw new Error('checkpoint-arguments-invalid');
    const pids = parseWatcherPids(readFileSync(pidPath, 'utf8'));
    const snapshot = collectChildren(threadId);
    const result = checkpointDecision(
      threadId,
      snapshot,
      pids,
      readProcessMetadata()
    );
    console.log(JSON.stringify(result));
    if (result.result !== 'go') process.exitCode = 3;
  } catch (error) {
    console.log(
      JSON.stringify({
        result: 'no-go',
        reasons: [
          error instanceof Error ? error.message : 'checkpoint-unavailable',
        ],
      })
    );
    process.exitCode = 2;
  }
}

function valueAfter(args: string[], key: string): string | undefined {
  const index = args.indexOf(key);
  return index >= 0 ? args[index + 1] : undefined;
}
