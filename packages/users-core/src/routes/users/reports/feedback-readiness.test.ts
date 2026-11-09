import { expect, it } from 'vitest';
import { countReportsWithoutFeedback } from './feedback-readiness';
function fixture(feedback: (string | null)[]) {
  const filters: [string, unknown][] = [];
  const rows = feedback.map((value, index) => ({
    id: String(index),
    feedback: value,
  }));
  const q = {
    select: () => q,
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return q;
    },
    in: () => Promise.resolve({ data: rows, error: null }),
  };
  return { client: { schema: () => ({ from: () => q }) }, filters };
}
it('refuses an entire send batch containing empty feedback before queueing', async () => {
  const f = fixture(['Teacher comment', '  ', null]);
  expect(
    await countReportsWithoutFeedback(f.client as never, 'ws', ['0', '1', '2'])
  ).toBe(2);
  expect(f.filters).toEqual([
    ['user_ws_id', 'ws'],
    ['group_ws_id', 'ws'],
  ]);
});
it('admits populated feedback and fails closed if a report moved out of scope', async () => {
  const f = fixture(['Teacher comment']);
  expect(
    await countReportsWithoutFeedback(f.client as never, 'ws', ['0'])
  ).toBe(0);
  expect(
    await countReportsWithoutFeedback(f.client as never, 'ws', ['missing'])
  ).toBe(1);
});
