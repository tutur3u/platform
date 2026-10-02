import policy from './release-note-policy-core.cjs';

/** Filter known Git merge/sync metadata while retaining product merge features. */
export const isReleaseBookkeeping = policy.isReleaseBookkeeping;
