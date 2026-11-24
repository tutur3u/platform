import { InternalApiError } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  describeWorkspaceAccessRemovalError,
  describeWorkspaceAccessRoleSaveError,
} from './workspace-access-removal-error';

const text = {
  creator: 't:ws-members.creator_removal_refused',
  fallback: 't:common.error',
  lastManager: 't:ws-members.last_manager_removal_refused',
};

describe('describeWorkspaceAccessRemovalError', () => {
  it('translates the last-manager refusal instead of showing the server text', () => {
    const error = new InternalApiError(
      'At least one member must be able to manage members',
      409,
      'WORKSPACE_LAST_MANAGER'
    );

    expect(describeWorkspaceAccessRemovalError(error, text)).toBe(
      't:ws-members.last_manager_removal_refused'
    );
  });

  it('translates the creator refusal', () => {
    const error = new InternalApiError(
      'The workspace creator cannot be removed',
      403,
      'WORKSPACE_CREATOR_PROTECTED'
    );

    expect(describeWorkspaceAccessRemovalError(error, text)).toBe(
      't:ws-members.creator_removal_refused'
    );
  });

  it('falls back to the existing failure text for anything else', () => {
    expect(
      describeWorkspaceAccessRemovalError(
        new InternalApiError('Forbidden', 403),
        text
      )
    ).toBe('Forbidden');
    expect(
      describeWorkspaceAccessRemovalError(
        new InternalApiError('Nope', 409, 'toString'),
        text
      )
    ).toBe('Nope');
    expect(describeWorkspaceAccessRemovalError(new Error('Broken'), text)).toBe(
      'Broken'
    );
    expect(describeWorkspaceAccessRemovalError('oops', text)).toBe(
      't:common.error'
    );
  });
});

describe('describeWorkspaceAccessRoleSaveError', () => {
  it('translates the last-manager refusal of an access-level save', () => {
    const error = new InternalApiError(
      'At least one member must be able to manage members',
      409,
      'WORKSPACE_LAST_MANAGER'
    );

    expect(describeWorkspaceAccessRoleSaveError(error, text)).toBe(
      't:ws-members.last_manager_removal_refused'
    );
  });

  it('keeps the server text or fallback for other failures', () => {
    expect(
      describeWorkspaceAccessRoleSaveError(
        new InternalApiError(
          'The workspace creator cannot be removed',
          403,
          'WORKSPACE_CREATOR_PROTECTED'
        ),
        text
      )
    ).toBe('The workspace creator cannot be removed');
    expect(
      describeWorkspaceAccessRoleSaveError(
        new InternalApiError('Forbidden', 403),
        text
      )
    ).toBe('Forbidden');
    expect(describeWorkspaceAccessRoleSaveError('oops', text)).toBe(
      't:common.error'
    );
  });
});
