import { createHash } from 'node:crypto';
import type {
  CalendarRecurrenceAnchor,
  CalendarRecurrenceRule,
} from '@tuturuuu/types/primitives/calendar-recurrence';
import {
  calendarAnchorAtSlot,
  inspectCalendarRecurrenceSlot,
  validateCalendarRecurrence,
} from '@tuturuuu/utils/calendar-recurrence';
import type { ProviderCreateMetadata } from './create-metadata';
import type { ProviderSeriesContent, ProviderSeriesSnapshot } from './payload';

export type ProviderSeriesBinding = {
  provider: 'google' | 'microsoft';
  connectionId: string;
  calendarId: string;
  masterId: string;
  etag: string;
};
export type ProviderSeriesStep =
  | {
      kind: 'create';
      key: string;
      snapshot: ProviderSeriesSnapshot;
      metadata?: ProviderCreateMetadata;
    }
  | {
      kind: 'update';
      target: 'master' | 'occurrence';
      snapshot: ProviderSeriesSnapshot;
      originalStartLocal?: string;
      instanceId?: string;
      instanceETag?: string;
    }
  | {
      kind: 'delete';
      target: 'master' | 'occurrence';
      originalStartLocal?: string;
      instanceId?: string;
      instanceETag?: string;
    }
  | {
      kind: 'trim';
      rule: CalendarRecurrenceRule;
      anchor: CalendarRecurrenceAnchor;
    };
export type ProviderSeriesPlan = {
  operationId: string;
  createBeforeTrim?: true;
  binding: ProviderSeriesBinding | null;
  steps: ProviderSeriesStep[];
};

export function providerSeriesCreatePlan(
  operationId: string,
  snapshot: ProviderSeriesSnapshot
): ProviderSeriesPlan {
  validateCalendarRecurrence(snapshot.rule, snapshot.anchor);
  return {
    operationId,
    binding: null,
    steps: [{ kind: 'create', key: createKey(operationId), snapshot }],
  };
}
function createKey(operationId: string) {
  // Google's base32hex event IDs accept hex; this remains stable across retries.
  return `tt${createHash('sha256').update(operationId).digest('hex')}`;
}

export function providerSeriesMutationPlan(input: {
  operationId: string;
  binding: ProviderSeriesBinding;
  current: ProviderSeriesSnapshot;
  action: 'update' | 'delete';
  scope: 'this' | 'all' | 'future';
  originalStartLocal?: string;
  event?: Partial<ProviderSeriesContent>;
  rule?: CalendarRecurrenceRule;
  anchor?: CalendarRecurrenceAnchor;
}): ProviderSeriesPlan {
  validateCalendarRecurrence(input.current.rule, input.current.anchor);
  let scope = input.scope;
  const slot =
    scope === 'all'
      ? null
      : inspectCalendarRecurrenceSlot({
          rule: input.current.rule,
          anchor: input.current.anchor,
          originalStartLocal: input.originalStartLocal ?? '',
        });
  if (scope === 'future' && slot?.precedingCount === 0) scope = 'all';
  const snapshot: ProviderSeriesSnapshot = {
    rule:
      input.rule ??
      (scope === 'future' ? slot!.remainingRule : input.current.rule),
    anchor:
      input.anchor ??
      (scope === 'all'
        ? input.current.anchor
        : calendarAnchorAtSlot(
            input.current.anchor,
            input.originalStartLocal!
          )),
    event: { ...input.current.event, ...input.event },
  };
  const plan: ProviderSeriesPlan = {
    operationId: input.operationId,
    binding: input.binding,
    steps: [],
  };
  if (scope === 'this') {
    if (input.rule || snapshot.anchor.allDay !== input.current.anchor.allDay)
      throw new RangeError(
        'Occurrence edits cannot change the recurrence pattern or all-day mode'
      );
    // An exception may move off the generating pattern: validate its range only.
    if (snapshot.anchor.endLocal <= snapshot.anchor.startLocal)
      throw new RangeError('Occurrence end must follow its start');
    plan.steps.push(
      input.action === 'delete'
        ? {
            kind: 'delete',
            target: 'occurrence',
            originalStartLocal: input.originalStartLocal,
          }
        : {
            kind: 'update',
            target: 'occurrence',
            originalStartLocal: input.originalStartLocal,
            snapshot,
          }
    );
  } else if (scope === 'all') {
    if (input.action === 'update')
      validateCalendarRecurrence(snapshot.rule, snapshot.anchor);
    plan.steps.push(
      input.action === 'delete'
        ? { kind: 'delete', target: 'master' }
        : { kind: 'update', target: 'master', snapshot }
    );
  } else {
    plan.steps.push({
      kind: 'trim',
      rule: slot!.previousRule!,
      anchor: input.current.anchor,
    });
    if (input.action === 'update') {
      validateCalendarRecurrence(snapshot.rule, snapshot.anchor);
      plan.createBeforeTrim = true;
      plan.steps.unshift({
        kind: 'create',
        key: createKey(input.operationId),
        snapshot,
      });
    }
  }
  return plan;
}
