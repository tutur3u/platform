import { expect, it } from 'vitest';
import { hasReportFeedback } from './report-feedback';
it.each([null, undefined, '', '   ', '\n\t', '\u00a0'])(
  'refuses empty feedback %j',
  (feedback) => {
    expect(hasReportFeedback(feedback)).toBe(false);
  }
);
it('accepts a real teacher comment with surrounding whitespace', () => {
  expect(hasReportFeedback('  Needs practice\n')).toBe(true);
});
