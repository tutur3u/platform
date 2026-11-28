#!/usr/bin/env node
// Performance Factory dispatch gate. Enforces board-list, verification-blocker,
// verify-post-deploy precondition, insufficient_data, unchecked, and intake
// guards in code, and fails closed when detection or extraction fails.
//
//   node scripts/perf/perf-dispatch-gate.mjs [gate]
//     --tasks <tasks.json|mirrors-dir> --detection <detection.json>
//     [--detector-exit 0] [--degraded-reason <reason>]
//     [--ready-lists "Queued,Live Today"] [--window-minutes 15] [--out p.json]
//   node scripts/perf/perf-dispatch-gate.mjs extract-candidates
//     --tasks <tasks.json|mirrors-dir> [--ready-lists "Queued,Live Today"]
//     [--out candidates.json]
//   node scripts/perf/perf-dispatch-gate.mjs intake-check
//     --detection <detection.json> [--out intake.json]
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';
import {
  DEFAULT_READY_LISTS,
  DEFAULT_WINDOW_MINUTES,
  hasVerificationBlocker,
  isIntakeBlocked,
  isRegressionTask,
  listSkipReason,
  NON_DISPATCHABLE_STAGES,
  parseIsoWithZone,
  taskKeyOf,
  verifyPreconditionSkipReason,
} from './perf-dispatch-gate-rules.mjs';
import { failIfMisrouted, isEntryPoint } from './perf-entry.mjs';
import { parseCandidates } from './perf-regression-detector.mjs';
import {
  CANDIDATE_INSUFFICIENT_DATA,
  CANDIDATE_READY,
} from './perf-regression-rules.mjs';

export { hasVerificationBlocker, isIntakeBlocked, parseIsoWithZone };

export function parseGateArgs(argv) {
  const mode = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'gate';
  if (!['gate', 'extract-candidates', 'intake-check'].includes(mode)) {
    throw new Error(`unknown mode: ${mode}`);
  }
  const { values } = parseNodeArgs({
    args: mode === argv[0] ? argv.slice(1) : argv,
    options: {
      tasks: { type: 'string' },
      detection: { type: 'string' },
      'detector-exit': { type: 'string', default: '0' },
      'degraded-reason': { type: 'string' },
      'expect-nonempty': { type: 'boolean', default: false },
      'ready-lists': { type: 'string', default: DEFAULT_READY_LISTS.join(',') },
      'window-minutes': {
        type: 'string',
        default: String(DEFAULT_WINDOW_MINUTES),
      },
      out: { type: 'string' },
    },
    strict: true,
  });
  if (mode !== 'intake-check' && !values.tasks) {
    throw new Error('--tasks is required');
  }
  const detectorExit = Number(values['detector-exit']);
  if (!Number.isInteger(detectorExit)) {
    throw new Error('--detector-exit must be an integer');
  }
  const windowMinutes = Number(values['window-minutes']);
  if (
    !Number.isInteger(windowMinutes) ||
    windowMinutes < 1 ||
    windowMinutes > 60
  ) {
    throw new Error('--window-minutes must be an integer between 1 and 60');
  }
  return {
    mode,
    tasks: values.tasks ?? null,
    detection: values.detection ?? null,
    detectorExit,
    degradedReason: values['degraded-reason']?.trim() || null,
    expectNonEmpty: Boolean(values['expect-nonempty']),
    windowMinutes,
    readyLists: values['ready-lists']
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    out: values.out ?? null,
  };
}

/** Load task records from a JSON file (`[...]` or `{ tasks }`) or mirror dir. */
export function loadTasks(targetPath) {
  const stats = statSync(targetPath);
  if (stats.isDirectory()) {
    return readdirSync(targetPath)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => JSON.parse(readFileSync(join(targetPath, name), 'utf8')));
  }
  const document = JSON.parse(readFileSync(targetPath, 'utf8'));
  return Array.isArray(document) ? document : (document?.tasks ?? []);
}

/**
 * Extract open regression-only candidates for `run-detector-local.sh --candidates`.
 * Non-regression tasks, tasks missing a board list, tasks outside `readyLists`,
 * and tasks in terminal/human stages are excluded.
 */
export function extractCandidates(
  tasks,
  { readyLists = DEFAULT_READY_LISTS } = {}
) {
  const readySet = new Set(readyLists);
  const eligible = [];
  const skipped = [];
  for (const task of tasks) {
    if (!isRegressionTask(task)) {
      skipped.push({ taskKey: taskKeyOf(task), reason: 'non_regression' });
      continue;
    }
    const listReason = listSkipReason(task, readySet);
    if (listReason) {
      skipped.push({ taskKey: taskKeyOf(task), reason: listReason });
      continue;
    }
    if (task.stage && NON_DISPATCHABLE_STAGES.has(task.stage)) {
      skipped.push({
        taskKey: taskKeyOf(task),
        reason: 'stage_not_dispatchable',
      });
      continue;
    }
    eligible.push(task);
  }
  const parsed = parseCandidates(eligible);
  return {
    candidates: parsed.candidates,
    skipped: [...skipped, ...parsed.skipped],
  };
}

/** Partition detected regressions into `ingestible` vs exact-id `blocked`. */
export function evaluateIntake(detection) {
  if (!detection || typeof detection !== 'object') {
    return {
      degraded: true,
      degradedReason: 'missing_detection_output',
      marker: 'DEGRADED: dispatch gate closed (missing_detection_output)',
      ingestible: [],
      blocked: [],
    };
  }
  if (!Array.isArray(detection.candidates)) {
    return {
      degraded: true,
      degradedReason: 'missing_candidate_output',
      marker: 'DEGRADED: dispatch gate closed (missing_candidate_output)',
      ingestible: [],
      blocked: [],
    };
  }
  const regressions = Array.isArray(detection.regressions)
    ? detection.regressions
    : [];
  const ingestible = [];
  const blocked = [];
  for (const regression of regressions) {
    if (isIntakeBlocked(regression, detection.candidates)) {
      blocked.push(regression);
    } else {
      ingestible.push(regression);
    }
  }
  return {
    degraded: false,
    degradedReason: null,
    marker: null,
    ingestible,
    blocked,
  };
}

function degradedResult(tasks, reason) {
  const skipped = tasks.filter(isRegressionTask).map((task) => ({
    taskKey: taskKeyOf(task),
    reason,
  }));
  return {
    degraded: true,
    degradedReason: reason,
    marker: `DEGRADED: dispatch gate closed (${reason})`,
    dispatchable: [],
    skipped,
    parked: [],
    rearmed: [],
  };
}

/** Decide which open regression tasks may be dispatched on this tick. */
export function evaluateDispatchGate({
  tasks = [],
  detection = null,
  detectorExit = 0,
  degradedReason = null,
  expectNonEmpty = false,
  readyLists = DEFAULT_READY_LISTS,
  windowMinutes = DEFAULT_WINDOW_MINUTES,
} = {}) {
  if (degradedReason) return degradedResult(tasks, degradedReason);
  if (detectorExit !== 0) {
    return degradedResult(tasks, `detector_exit_${detectorExit}`);
  }
  if (!detection || typeof detection !== 'object') {
    return degradedResult(tasks, 'missing_detection_output');
  }
  if (!Array.isArray(detection.candidates)) {
    return degradedResult(tasks, 'missing_candidate_output');
  }
  if (expectNonEmpty && tasks.length === 0) {
    return degradedResult(tasks, 'empty_task_list');
  }

  const readySet = new Set(readyLists);
  const dispatchable = [];
  const skipped = [];
  const parked = [];
  const rearmed = [];

  for (const task of tasks) {
    const taskKey = taskKeyOf(task);
    if (!isRegressionTask(task)) {
      skipped.push({ taskKey, reason: 'non_regression' });
      continue;
    }
    const listReason = listSkipReason(task, readySet);
    if (listReason) {
      skipped.push({ taskKey, reason: listReason });
      continue;
    }
    if (task.stage && NON_DISPATCHABLE_STAGES.has(task.stage)) {
      skipped.push({ taskKey, reason: 'stage_not_dispatchable' });
      continue;
    }
    if (hasVerificationBlocker(task)) {
      skipped.push({ taskKey, reason: 'verification_blocked' });
      continue;
    }
    const verifyReason = verifyPreconditionSkipReason(
      task,
      detection,
      windowMinutes
    );
    if (verifyReason) {
      skipped.push({ taskKey, reason: verifyReason });
      continue;
    }

    const id = task.regression?.id ?? task.id;
    const candidate =
      detection.candidates.find((entry) => entry.id === id) ?? null;
    if (!candidate) {
      skipped.push({ taskKey, reason: 'missing_candidate' });
      continue;
    }
    if (candidate.state === CANDIDATE_INSUFFICIENT_DATA) {
      skipped.push({
        taskKey,
        reason: CANDIDATE_INSUFFICIENT_DATA,
        observedRequests: candidate.observedRequests ?? null,
        minRequests: candidate.minRequests ?? null,
      });
      parked.push({
        taskKey,
        id: candidate.id,
        app: candidate.app,
        metric: candidate.metric ?? null,
        observedRequests: candidate.observedRequests ?? null,
        minRequests: candidate.minRequests ?? null,
        window: candidate.window ?? null,
        transition: Boolean(candidate.transition),
      });
      continue;
    }
    if (candidate.state === 'unchecked') {
      skipped.push({ taskKey, reason: 'unchecked' });
      continue;
    }
    if (candidate.state !== CANDIDATE_READY) {
      skipped.push({ taskKey, reason: 'candidate_not_ready' });
      continue;
    }
    if (task.dataGate) {
      skipped.push({ taskKey, reason: 'data_gate_active' });
      rearmed.push({
        taskKey,
        id: candidate.id,
        app: candidate.app,
        metric: candidate.metric ?? null,
        observedRequests: candidate.observedRequests ?? null,
        minRequests: candidate.minRequests ?? null,
        window: candidate.window ?? null,
        transition: true,
      });
      continue;
    }
    dispatchable.push(taskKey);
  }

  return {
    degraded: false,
    degradedReason: null,
    marker: null,
    dispatchable,
    skipped,
    parked,
    rearmed,
  };
}

function readOptionalJson(path) {
  if (!path) return { ok: false, reason: 'missing_detection_output' };
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    return {
      ok: false,
      reason:
        error?.code === 'ENOENT'
          ? 'missing_detection_output'
          : 'invalid_detection_output',
    };
  }
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseGateArgs(argv);
  let result;
  if (options.mode === 'intake-check') {
    const loaded = readOptionalJson(options.detection);
    result = loaded.ok
      ? evaluateIntake(loaded.value)
      : {
          degraded: true,
          degradedReason: loaded.reason,
          marker: `DEGRADED: dispatch gate closed (${loaded.reason})`,
          ingestible: [],
          blocked: [],
        };
  } else {
    const tasks = loadTasks(options.tasks);
    if (options.mode === 'extract-candidates') {
      result = extractCandidates(tasks, { readyLists: options.readyLists });
    } else if (options.degradedReason) {
      result = degradedResult(tasks, options.degradedReason);
    } else if (options.detectorExit !== 0) {
      result = degradedResult(tasks, `detector_exit_${options.detectorExit}`);
    } else {
      const loaded = readOptionalJson(options.detection);
      result = loaded.ok
        ? evaluateDispatchGate({
            tasks,
            detection: loaded.value,
            detectorExit: options.detectorExit,
            expectNonEmpty: options.expectNonEmpty,
            readyLists: options.readyLists,
            windowMinutes: options.windowMinutes,
          })
        : degradedResult(tasks, loaded.reason);
    }
  }
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (options.out) {
    mkdirSync(dirname(resolve(options.out)), { recursive: true });
    writeFileSync(options.out, text);
  }
  return { result, text };
}

if (isEntryPoint(import.meta.url)) {
  try {
    const { text } = runCli();
    process.stdout.write(text);
  } catch (error) {
    console.error(error?.message ?? error);
    process.exitCode = 2;
  }
} else {
  failIfMisrouted(import.meta.url);
}
