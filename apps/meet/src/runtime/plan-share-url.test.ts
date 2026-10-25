import './bridge-runtime';
import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { generateCanonicalMeetUrl } from '@tuturuuu/ui/legacy/meet/planId/copy-link-button';
import { expect, it } from 'vitest';
import { currentMeetBaseUrl } from './bridge-runtime';

it.each([
  [
    'https://meet.tuturuuu.com/vi/plans/one',
    '',
    'https://meet.tuturuuu.com/plans/one',
  ],
  [
    'https://tuturuuu.com/meet/vi/plans/one',
    '/meet',
    'https://tuturuuu.com/meet/plans/one',
  ],
])(
  'shares the plan at its resolved document base: %s',
  async (requestUrl, appBase, expected) => {
    await withBridgeRequest(
      { request: new Request(requestUrl), appBase },
      () => {
        expect(
          generateCanonicalMeetUrl('one', `${currentMeetBaseUrl()}/plans`)
        ).toBe(expected);
      }
    );
  }
);

it('retains the existing canonical default for non-migrated callers', () => {
  expect(generateCanonicalMeetUrl('one')).toBe(
    'https://tuturuuu.com/meet/plans/one'
  );
});
