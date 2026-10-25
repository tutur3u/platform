import { describe, expect, it } from 'vitest';
import { novaActionContracts } from './action-contracts';

const id = '6ab768a9-cd1d-41a2-ad88-632a7c3a08f9';

describe('Nova native action payloads', () => {
  it('preserves valid positional arguments and optional hidden-case selection', () => {
    expect(novaActionContracts.fetchAllProblems.parse([id, id])).toEqual([
      id,
      id,
    ]);
    expect(novaActionContracts.getFullSubmission.parse([id])).toEqual([id]);
    expect(novaActionContracts.getFullSubmission.parse([id, false])).toEqual([
      id,
      false,
    ]);
  });

  it('rejects malformed identity, coercion, surplus args and unexpected OTP fields', () => {
    expect(
      novaActionContracts.fetchAllProblems.safeParse([id, 'foreign-user'])
        .success
    ).toBe(false);
    expect(
      novaActionContracts.getFullSubmission.safeParse([id, 'true']).success
    ).toBe(false);
    expect(novaActionContracts.fetchAdmins.safeParse([id]).success).toBe(false);
    expect(
      novaActionContracts.addWhitelistEmail.safeParse(['invalid', true]).success
    ).toBe(false);
    expect(
      novaActionContracts.sendOtpAction.safeParse([
        { email: 'actor@example.test', userId: id },
      ]).success
    ).toBe(false);
  });
});
