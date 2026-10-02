import { validate, version } from 'uuid';
import { expect, it } from 'vitest';
import { createCalendarCreationRequests } from './calendar-creation-request';

it('retries a draft with one UUIDv7 until a new draft starts', () => {
  const ids = createCalendarCreationRequests();
  ids.beginDraft();
  const first = ids.forAttempt({ title: 'draft' }, true);
  expect(validate(first)).toBe(true);
  expect(version(first)).toBe(7);
  expect(ids.forAttempt({ title: 'same draft retry' }, true)).toBe(first);
  ids.beginDraft();
  expect(ids.forAttempt({}, true)).not.toBe(first);
});
it('keeps direct attempt identity on a lost-response retry without conflating new events', () => {
  const ids = createCalendarCreationRequests();
  const event = { title: 'synthetic' };
  expect(ids.forAttempt(event, false)).toBe(ids.forAttempt(event, false));
  expect(ids.forAttempt({ ...event }, false)).not.toBe(
    ids.forAttempt(event, false)
  );
});
