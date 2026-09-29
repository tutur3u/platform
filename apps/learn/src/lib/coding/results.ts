import type { CodingLanguage } from './languages';

export type CodingExecutionKind = 'test' | 'submit';

export interface CodingCaseResult {
  durationMs: number | null;
  index: number;
  output?: string;
  passed: boolean;
  reason: CodingCaseReason;
  stderr?: string;
  visible: boolean;
}

type CodingCaseReason =
  | 'compile_error'
  | 'failed'
  | 'output_limit'
  | 'passed'
  | 'runtime_error'
  | 'time_limit'
  | 'unknown'
  | 'wrong_answer';

const knownReasons = new Set<CodingCaseReason>([
  'compile_error',
  'failed',
  'output_limit',
  'passed',
  'runtime_error',
  'time_limit',
  'unknown',
  'wrong_answer',
]);

export interface CodingExecutionResult {
  hiddenPassed: number;
  hiddenTotal: number;
  medianDurationMs: number | null;
  passed: number;
  results: CodingCaseResult[];
  timingRangeMs: [number, number] | null;
  total: number;
}

export interface CodingExecutionSummary {
  challengeSlug: string;
  createdAt: string;
  id: string;
  kind: CodingExecutionKind;
  language: CodingLanguage | null;
  result: CodingExecutionResult | null;
  source: string;
  status: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function duration(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 120_000
    ? Math.round(value)
    : null;
}

export function summarizeJudgeResult(message: string | null) {
  if (!message) return null;
  try {
    const parsed: unknown = JSON.parse(message);
    if (!isRecord(parsed) || !Array.isArray(parsed.results)) return null;
    const results: CodingCaseResult[] = parsed.results.map((raw, index) => {
      if (!isRecord(raw)) throw new Error('Invalid Judge case');
      const visible = raw.visible === true;
      const passed = raw.passed === true;
      return {
        durationMs: visible ? duration(raw.durationMs) : null,
        index,
        passed,
        reason:
          visible && knownReasons.has(raw.reason as CodingCaseReason)
            ? (raw.reason as CodingCaseReason)
            : passed
              ? 'passed'
              : visible
                ? 'unknown'
                : 'failed',
        visible,
        ...(visible && typeof raw.output === 'string'
          ? { output: raw.output.slice(0, 4096) }
          : {}),
        ...(visible && typeof raw.stderr === 'string'
          ? { stderr: raw.stderr.slice(0, 4096) }
          : {}),
      };
    });
    const timings = results
      .map((result) => result.durationMs)
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const middle = Math.floor(timings.length / 2);
    const medianDurationMs = timings.length
      ? timings.length % 2
        ? timings[middle]!
        : Math.round((timings[middle - 1]! + timings[middle]!) / 2)
      : null;
    return {
      hiddenPassed: results.filter((result) => !result.visible && result.passed)
        .length,
      hiddenTotal: results.filter((result) => !result.visible).length,
      medianDurationMs,
      passed: results.filter((result) => result.passed).length,
      results,
      timingRangeMs: timings.length
        ? ([timings[0]!, timings[timings.length - 1]!] as [number, number])
        : null,
      total: results.length,
    } satisfies CodingExecutionResult;
  } catch {
    return null;
  }
}
