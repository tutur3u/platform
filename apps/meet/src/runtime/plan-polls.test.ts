import { describe, expect, it } from 'vitest';
import { meetPlanPolls } from './plan-polls';

describe('plan poll serialization boundary', () => {
  it('preserves nested poll data and all JSON fields', () => {
    const polls = {
      polls: [{ id: 'poll', options: [{ votes: [1, null, true, 'guest'] }] }],
      futureField: { nested: [[], {}] },
    };
    expect(meetPlanPolls.parse(polls)).toEqual(polls);
    expect(meetPlanPolls.parse(null)).toBeNull();
  });

  it('rejects non-JSON values instead of fabricating an empty poll result', () => {
    for (const value of [
      undefined,
      NaN,
      Infinity,
      () => null,
      new Date(),
      { nested: undefined },
    ])
      expect(meetPlanPolls.safeParse(value).success).toBe(false);
  });
});
