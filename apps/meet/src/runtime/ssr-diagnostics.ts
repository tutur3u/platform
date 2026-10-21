import { isRedirect } from '@tanstack/react-router';
import { z } from 'zod';

export const MEET_SSR_MARKER = 'meet-ssr-diagnostic ';
const names = [
  'Error',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'UNKNOWN',
] as const;
const codes = [
  'ERR_MODULE_NOT_FOUND',
  'ERR_INVALID_URL',
  'ERR_INVALID_ARG_TYPE',
  'ERR_ASSERTION',
  'ERR_REQUIRE_ESM',
  'UNKNOWN',
] as const;
const functions = [
  'handleMeetRequest',
  'dispatchThroughMeetProxy',
  'loadPageModel',
  'loadResolvedPageModel',
] as const;
const phases = [
  'loader-import',
  'loader-model',
  'handler',
  'render-boundary',
] as const;
const scopes = ['login', 'callback', 'other', 'UNKNOWN'] as const;
const stages = ['proxy', 'start', 'UNKNOWN'] as const;
const outcomes = [
  'delegating',
  'threw',
  'returned500',
  'returnedredirect',
  'returnedother',
] as const;
const integer = z.number().int().min(0).max(1_000_000);
const recordSchema = z
  .object({
    version: z.literal(1),
    phase: z.enum(phases),
    outcome: z.enum(outcomes),
    scope: z.enum(scopes).default('UNKNOWN'),
    stage: z.enum(stages).default('UNKNOWN'),
    kind: z.enum([
      'router-redirect',
      'response-other',
      'error',
      'other',
      'UNKNOWN',
    ]),
    name: z.enum(names),
    code: z.enum(codes),
    inspection: z.enum(['available', 'unavailable', 'overflow']),
    frames: z
      .array(
        z
          .object({
            function: z.enum(functions),
            line: integer,
            column: integer,
          })
          .strict()
      )
      .max(4),
  })
  .strict()
  .refine(
    (record) =>
      record.phase === 'handler' ||
      (record.scope === 'UNKNOWN' && record.stage === 'UNKNOWN')
  )
  .refine(
    (record) =>
      record.outcome !== 'delegating' ||
      (record.phase === 'handler' &&
        record.stage !== 'UNKNOWN' &&
        record.kind === 'UNKNOWN' &&
        record.name === 'UNKNOWN' &&
        record.code === 'UNKNOWN' &&
        record.frames.length === 0)
  );
export type MeetSsrRecord = z.infer<typeof recordSchema>;
export type MeetSsrContext = Readonly<Pick<MeetSsrRecord, 'scope' | 'stage'>>;
type Phase = MeetSsrRecord['phase'];
type Outcome = MeetSsrRecord['outcome'];

export function classifyMeetSsrRequest(
  request: Request
): MeetSsrRecord['scope'] {
  try {
    const path = new URL(request.url).pathname;
    if (['/login', '/en/login', '/vi/login'].includes(path)) return 'login';
    if (
      ['/verify-token', '/en/verify-token', '/vi/verify-token'].includes(path)
    )
      return 'callback';
    return 'other';
  } catch {
    return 'UNKNOWN';
  }
}

function data(value: object, key: PropertyKey, complete = false): unknown {
  let current: object | null = value;
  for (let depth = 0; current && depth < 3; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      if (!('value' in descriptor))
        throw new Error('Unavailable diagnostic field');
      return descriptor.value;
    }
    current = Object.getPrototypeOf(current);
  }
  if (current && complete)
    throw new Error('Unavailable diagnostic prototype depth');
  return undefined;
}
const allowed = <T extends string>(value: unknown, values: readonly T[]) =>
  values.find((entry) => entry === value) ?? 'UNKNOWN';

export function projectMeetSsr(
  value: unknown,
  phase: Phase,
  outcome: Outcome,
  context?: MeetSsrContext
): MeetSsrRecord {
  const record: MeetSsrRecord = {
    version: 1,
    phase,
    outcome,
    scope:
      phase === 'handler'
        ? (scopes.find((scope) => scope === context?.scope) ?? 'UNKNOWN')
        : 'UNKNOWN',
    stage:
      phase === 'handler'
        ? (stages.find((stage) => stage === context?.stage) ?? 'UNKNOWN')
        : 'UNKNOWN',
    kind: 'UNKNOWN',
    name: 'UNKNOWN',
    code: 'UNKNOWN',
    inspection: 'available',
    frames: [],
  };
  if (outcome === 'delegating') return record;
  try {
    // The owning predicate reads instanceof Response and options; inspect descriptors first.
    // This avoids ordinary accessors, not hostile Proxy traps or mutated global intrinsics.
    data(Response, Symbol.hasInstance, true);
    data(Response, 'prototype', true);
    if (value instanceof Response) data(value, 'options', true);
    record.kind = isRedirect(value)
      ? 'router-redirect'
      : value instanceof Response
        ? 'response-other'
        : value instanceof Error
          ? 'error'
          : 'other';
    if (record.kind !== 'error' || !(value instanceof Error)) return record;
    record.name = allowed(data(value, 'name'), names);
    record.code = allowed(data(value, 'code'), codes);
    const stack = data(value, 'stack');
    if (typeof stack !== 'string') {
      record.inspection = 'unavailable';
      return record;
    }
    if (stack.length > 4096) record.inspection = 'overflow';
    const lines = stack.slice(0, 4096).split('\n');
    if (lines.length > 17) record.inspection = 'overflow';
    for (const line of lines.slice(1, 17)) {
      const match =
        /^\s*at (?:async )?(?:Object\.)?([A-Za-z]+) \([^\n]*:(\d+):(\d+)\)\s*$/.exec(
          line
        );
      if (!match) continue;
      const fn = functions.find((fn) => fn === match[1]);
      const row = Number(match[2]),
        column = Number(match[3]);
      if (
        !fn ||
        !integer.safeParse(row).success ||
        !integer.safeParse(column).success
      )
        continue;
      if (record.frames.length === 4) {
        record.inspection = 'overflow';
        break;
      }
      record.frames.push({ function: fn, line: row, column });
    }
  } catch {
    record.inspection = 'unavailable';
  }
  return record;
}

export function parseMeetSsrRecord(value: unknown): MeetSsrRecord | undefined {
  try {
    const result = recordSchema.safeParse(value);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
let reported = 0;
export function reportMeetSsr(
  value: unknown,
  phase: Phase,
  outcome: Outcome,
  context?: MeetSsrContext
) {
  try {
    if (typeof window !== 'undefined' || reported > 64) return;
    if (reported++ === 64) {
      console.error(`${MEET_SSR_MARKER}{"version":1,"overflow":true}`);
      return;
    }
    console.error(
      `${MEET_SSR_MARKER}${JSON.stringify(projectMeetSsr(value, phase, outcome, context))}`
    );
  } catch {
    /* Diagnostics cannot replace the owning throw, response or fallback. */
  }
}
export async function observeMeetSsr<T>(
  phase: Phase,
  operation: () => T | Promise<T>,
  context?: MeetSsrContext
): Promise<T> {
  if (
    phase === 'handler' &&
    context &&
    ['proxy', 'start'].includes(context.stage)
  )
    reportMeetSsr(undefined, phase, 'delegating', context);
  let value: T;
  try {
    value = await operation();
  } catch (error) {
    reportMeetSsr(error, phase, 'threw', context);
    throw error;
  }
  let outcome: Outcome = 'returnedother';
  try {
    if (value instanceof Response) {
      const status: unknown = Reflect.get(Response.prototype, 'status', value);
      outcome =
        status === 500
          ? 'returned500'
          : typeof status === 'number' && status >= 300 && status <= 399
            ? 'returnedredirect'
            : 'returnedother';
    }
  } catch {
    /* Preserve a returned value even when its diagnostic inspection fails. */
  }
  reportMeetSsr(value, phase, outcome, context);
  return value;
}
