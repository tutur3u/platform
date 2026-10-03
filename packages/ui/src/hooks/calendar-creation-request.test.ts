import { validate, version } from 'uuid';
import { expect, it } from 'vitest';
import {
  createCalendarCreationRequests,
  createOptimisticEventId,
  newCalendarCreationRequestId,
} from './calendar-creation-request';

it('keeps explicit draft IDs on lost responses and separates manual and AI drafts', () => {
  const ids = createCalendarCreationRequests();
  const manual = newCalendarCreationRequestId();
  const ai = [newCalendarCreationRequestId(), newCalendarCreationRequestId()];
  expect(new Set([manual, ...ai]).size).toBe(3);
  for (const [index, id] of [manual, ...ai].entries()) {
    expect(validate(id)).toBe(true);
    expect(version(id)).toBe(7);
    const payload = {
      title: `draft ${index}`,
      source: { provider: 'google', connectionId: 'owned' },
    };
    expect(ids.forAttempt(payload, id)).toBe(id);
    expect(ids.forAttempt({ ...payload }, id)).toBe(id);
  }
});
it('rejects changed intent for an uncertain draft before dispatch', () => {
  const ids = createCalendarCreationRequests();
  const id = newCalendarCreationRequestId();
  ids.forAttempt({ title: 'Original' }, id);
  expect(() => ids.forAttempt({ title: 'Edited' }, id)).toThrow(
    'draft changed'
  );
  expect(
    ids.forAttempt({ title: 'Edited' }, newCalendarCreationRequestId())
  ).not.toBe(id);
});
it('allocates a new independent intent per call unless the caller supplies a retry ID', () => {
  const ids = createCalendarCreationRequests();
  const event = { title: 'Same independent contents' };
  expect(ids.forAttempt(event)).not.toBe(ids.forAttempt(event));
});

it('accepts the same serialized intent when object key order changes', () => {
  const ids = createCalendarCreationRequests();
  const id = newCalendarCreationRequestId();
  ids.forAttempt(
    { title: 'Same', source: { provider: 'google', connectionId: 'owned' } },
    id
  );
  expect(
    ids.forAttempt(
      { source: { connectionId: 'owned', provider: 'google' }, title: 'Same' },
      id
    )
  ).toBe(id);
});

it('keeps optimistic identifiers separate from multi-day segment delimiters', () => {
  const id = createOptimisticEventId();
  expect(id).toMatch(/^optimistic[a-zA-Z0-9]+$/);
  expect(id).not.toContain('-');
  expect(createOptimisticEventId()).not.toBe(id);
});
