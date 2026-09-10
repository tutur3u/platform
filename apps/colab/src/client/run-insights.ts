import type {
  Run,
  RunStopReason,
  TeamLimits,
  Trace,
  TraceStatus,
} from '@tuturuuu/multiplayer';

type ToolInput = {
  app?: unknown;
  content?: unknown;
  id?: unknown;
  query?: unknown;
  title?: unknown;
  tool?: unknown;
};

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function traceStatus(trace: Trace): TraceStatus {
  if (trace.status) return trace.status;
  return typeof parseObject(trace.output).error === 'string'
    ? 'error'
    : 'success';
}

export function traceInsight(trace: Trace) {
  const input = parseObject(trace.input) as ToolInput;
  const output = parseObject(trace.output);
  const [fallbackApp = 'app', fallbackAction = 'action'] =
    trace.tool.split('.');
  const action = String(input.tool ?? fallbackAction);
  const app = String(input.app ?? fallbackApp);
  const detail = String(
    action === 'search'
      ? input.query || ''
      : action === 'create'
        ? input.title || ''
        : input.id || input.title || ''
  );
  return {
    action,
    app,
    detail,
    errorCode: typeof output.error === 'string' ? output.error : null,
    isWrite: action === 'create' || action === 'update',
    status: traceStatus(trace),
  };
}

function legacyStopReason(run: Run): RunStopReason {
  if (run.answer.includes('used its available tool calls')) return 'tool_limit';
  if (run.answer.includes('reached its turn limit')) return 'turn_limit';
  return 'answered';
}

export function runInsights(run: Run, limits: TeamLimits) {
  const inferredStopReason = legacyStopReason(run);
  const usage = run.usage ?? {
    turns: run.trace.length + (inferredStopReason === 'turn_limit' ? 0 : 1),
    toolCalls: run.trace.length,
    turnLimit: limits.agentTurnLimit,
    toolCallLimit: limits.toolCallLimit,
  };
  const steps = run.trace.map(traceInsight);
  const failed =
    usage.failedToolCalls ??
    steps.filter((step) => step.status === 'error').length;
  const successful = usage.successfulToolCalls ?? steps.length - failed;
  const writes =
    usage.writeToolCalls ??
    steps.filter((step) => step.status === 'success' && step.isWrite).length;
  const reads = steps.filter(
    (step) =>
      step.status === 'success' &&
      (step.action === 'search' || step.action === 'read')
  ).length;
  const stopReason = usage.stopReason ?? inferredStopReason;
  const status =
    stopReason !== 'answered'
      ? 'limited'
      : failed > 0
        ? 'attention'
        : 'complete';
  return {
    apps: new Set(
      steps.filter((step) => step.status === 'success').map((step) => step.app)
    ).size,
    failed,
    reads,
    status,
    steps,
    stopReason,
    successful,
    usage,
    writes,
  } as const;
}
