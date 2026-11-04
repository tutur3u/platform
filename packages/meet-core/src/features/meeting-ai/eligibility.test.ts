import { expect, it } from 'vitest';
import { canTranscribeMeet } from './eligibility';

it('permits solo and group meetings only while joined', () => {
  expect(canTranscribeMeet(false, 1)).toBe(true);
  expect(canTranscribeMeet(false, 2)).toBe(true);
  expect(canTranscribeMeet(false, 0)).toBe(false);
  expect(canTranscribeMeet(true, 1)).toBe(false);
});
