import { MAX_URL_LENGTH } from '@tuturuuu/utils/constants';
import { describe, expect, it } from 'vitest';
import { resolveWorkspaceSetupReturnUrl } from './workspace-setup-return';

describe('resolveWorkspaceSetupReturnUrl', () => {
  it('accepts a registered satellite URL containing the new workspace', () => {
    expect(
      resolveWorkspaceSetupReturnUrl(
        'https://tasks.tuturuuu.com/vi/workspace-1/tasks?view=mine',
        'workspace-1'
      )?.toString()
    ).toBe('https://tasks.tuturuuu.com/vi/workspace-1/tasks?view=mine');
  });

  it.each([
    ['external origin', 'https://evil.example/workspace-1'],
    ['Platform origin', 'https://tuturuuu.com/workspace-1'],
    ['different workspace', 'https://tasks.tuturuuu.com/workspace-2/tasks'],
    [
      'embedded workspace text',
      'https://tasks.tuturuuu.com/xworkspace-1/tasks',
    ],
  ])('rejects %s', (_, returnUrl) => {
    expect(resolveWorkspaceSetupReturnUrl(returnUrl, 'workspace-1')).toBeNull();
  });

  it('rejects oversized return URLs', () => {
    const returnUrl = `https://tasks.tuturuuu.com/workspace-1/tasks?q=${'x'.repeat(
      MAX_URL_LENGTH
    )}`;

    expect(resolveWorkspaceSetupReturnUrl(returnUrl, 'workspace-1')).toBeNull();
  });
});
