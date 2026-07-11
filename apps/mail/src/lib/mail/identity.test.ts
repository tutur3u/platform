import { describe, expect, it } from 'vitest';
import { resolveInternalMailboxName } from './identity';

describe('resolveInternalMailboxName', () => {
  it('uses and trims the canonical Tuturuuu user display name', () => {
    expect(
      resolveInternalMailboxName('  Võ Hoàng Phúc  ', 'phucvo@tuturuuu.com')
    ).toBe('Võ Hoàng Phúc');
  });

  it('falls back to the mailbox address when the profile name is empty', () => {
    expect(resolveInternalMailboxName('  ', 'phucvo@tuturuuu.com')).toBe(
      'phucvo@tuturuuu.com'
    );
  });
});
