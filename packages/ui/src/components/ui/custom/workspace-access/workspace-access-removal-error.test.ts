import { InternalApiError } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import { describeWorkspaceAccessRemovalError } from './workspace-access-removal-error';

const t = (key: string) => `t:${key}`;

describe('describeWorkspaceAccessRemovalError', () => {
  it('translates the last-manager refusal instead of showing the server text', () => {
    const error = new InternalApiError(
      'At least one member must be able to manage members',
      409,
      'WORKSPACE_LAST_MANAGER'
    );

    expect(describeWorkspaceAccessRemovalError(error, t)).toBe(
      't:ws-members.last_manager_removal_refused'
    );
  });

  it('translates the creator refusal', () => {
    const error = new InternalApiError(
      'The workspace creator cannot be removed',
      403,
      'WORKSPACE_CREATOR_PROTECTED'
    );

    expect(describeWorkspaceAccessRemovalError(error, t)).toBe(
      't:ws-members.creator_removal_refused'
    );
  });

  it('falls back to the existing failure text for anything else', () => {
    expect(
      describeWorkspaceAccessRemovalError(
        new InternalApiError('Forbidden', 403),
        t
      )
    ).toBe('Forbidden');
    expect(
      describeWorkspaceAccessRemovalError(
        new InternalApiError('Nope', 409, 'toString'),
        t
      )
    ).toBe('Nope');
    expect(describeWorkspaceAccessRemovalError(new Error('Broken'), t)).toBe(
      'Broken'
    );
    expect(describeWorkspaceAccessRemovalError('oops', t)).toBe(
      't:common.error'
    );
  });
});
