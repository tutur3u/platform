import { InternalApiError } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import { isLegacyMissingWorkspaceError } from './workspace';

describe('isLegacyMissingWorkspaceError', () => {
  it('treats 401/403/404 InternalApiErrors as missing (not-found)', () => {
    for (const status of [401, 403, 404]) {
      expect(
        isLegacyMissingWorkspaceError(new InternalApiError('nope', status))
      ).toBe(true);
    }
  });

  it('treats the legacy 500 "Error fetching workspaces" as missing', () => {
    expect(
      isLegacyMissingWorkspaceError(
        new InternalApiError('Error fetching workspaces', 500)
      )
    ).toBe(true);
  });

  it('does NOT treat a generic 500 as missing (propagates)', () => {
    expect(
      isLegacyMissingWorkspaceError(
        new InternalApiError('Internal Server Error', 500)
      )
    ).toBe(false);
  });

  it('does NOT treat other statuses (e.g. 400, 429, 503) as missing', () => {
    for (const status of [400, 429, 503]) {
      expect(
        isLegacyMissingWorkspaceError(new InternalApiError('boom', status))
      ).toBe(false);
    }
  });

  it('does NOT treat non-InternalApiError values as missing', () => {
    expect(
      isLegacyMissingWorkspaceError(new Error('Error fetching workspaces'))
    ).toBe(false);
    expect(isLegacyMissingWorkspaceError(null)).toBe(false);
    expect(isLegacyMissingWorkspaceError(undefined)).toBe(false);
    expect(isLegacyMissingWorkspaceError({ status: 404 })).toBe(false);
  });
});
