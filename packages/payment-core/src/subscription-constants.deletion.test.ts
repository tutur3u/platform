import { describe, expect, it } from 'vitest';
import {
  isWorkspaceDeletionRevocation,
  WORKSPACE_DELETION_REVOKE_COMMENT,
} from './subscription-constants';

describe('isWorkspaceDeletionRevocation', () => {
  it.each([
    [WORKSPACE_DELETION_REVOKE_COMMENT, true],
    [null, false],
    [undefined, false],
    ['Too expensive', false],
  ])('recognizes comment %j as %s', (comment, expected) => {
    expect(
      isWorkspaceDeletionRevocation({ customerCancellationComment: comment })
    ).toBe(expected);
  });
});
