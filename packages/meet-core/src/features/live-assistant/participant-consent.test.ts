import { describe, expect, it } from 'vitest';
import {
  canForwardMiraMix,
  canReceiveMiraAudio,
  includesMiraParticipant,
  type MiraConsentPolicy,
  miraPromptDefault,
  recordMiraParticipantChoice,
} from './participant-consent';

function policy(): MiraConsentPolicy {
  return {
    authorized: true,
    workspaceId: 'workspace',
    meetingId: 'meeting',
    noticeVersion: 'synthetic-notice-v1',
    attestation: null,
    records: {},
  };
}

function choose(
  state: MiraConsentPolicy,
  accountId: string,
  choice: 'continue' | 'mute' | 'leave'
) {
  const record = recordMiraParticipantChoice(
    state,
    { accountId, admitted: true },
    choice,
    1000
  );
  expect(record).not.toBeNull();
  return { ...state, records: { ...state.records, [accountId]: record! } };
}

describe('Mira participant choices', () => {
  it('preselects Continue without accepting processing or output', () => {
    const state = policy();
    expect(miraPromptDefault()).toBe('continue');
    expect(miraPromptDefault('mute')).toBe('mute');
    expect(miraPromptDefault('mute', 'continue')).toBe('continue');
    expect(includesMiraParticipant(state, 'alice')).toBe(false);
    expect(canForwardMiraMix(state, ['alice'])).toBe(false);
    expect(canReceiveMiraAudio(state, 'alice', ['alice'])).toBe(false);
  });

  it('allows room input and output only after every current person clicked', () => {
    const alice = choose(policy(), 'alice', 'continue');
    expect(canForwardMiraMix(alice, ['alice'])).toBe(true);
    expect(canForwardMiraMix(alice, ['alice', 'guest'])).toBe(false);
    expect(canReceiveMiraAudio(alice, 'alice', ['alice', 'guest'])).toBe(false);
    const both = choose(alice, 'guest', 'continue');
    expect(canForwardMiraMix(both, ['alice', 'guest'])).toBe(true);
    expect(canReceiveMiraAudio(both, 'guest', ['alice', 'guest'])).toBe(true);
  });

  it('mutes the whole mix on withdrawal and resumes only after reacceptance', () => {
    const both = choose(
      choose(policy(), 'alice', 'continue'),
      'bob',
      'continue'
    );
    const muted = choose(both, 'bob', 'mute');
    expect(canForwardMiraMix(muted, ['alice', 'bob'])).toBe(false);
    expect(canReceiveMiraAudio(muted, 'alice', ['alice', 'bob'])).toBe(false);
    expect(includesMiraParticipant(muted, 'bob')).toBe(false);
    const resumed = choose(muted, 'bob', 'continue');
    expect(resumed.records.bob?.revision).toBe(3);
    expect(canForwardMiraMix(resumed, ['alice', 'bob'])).toBe(true);
  });

  it('does not reuse a choice for another meeting or notice version', () => {
    const accepted = choose(policy(), 'alice', 'continue');
    expect(
      includesMiraParticipant({ ...accepted, meetingId: 'next' }, 'alice')
    ).toBe(false);
    expect(
      includesMiraParticipant({ ...accepted, noticeVersion: 'next' }, 'alice')
    ).toBe(false);
    expect(
      includesMiraParticipant({ ...accepted, authorized: false }, 'alice')
    ).toBe(false);
  });

  it('binds records to the admitted server actor and stores no prompt default', () => {
    const state = policy();
    expect(
      recordMiraParticipantChoice(
        state,
        { accountId: 'alice', admitted: false },
        'continue',
        1000
      )
    ).toBeNull();
    const record = recordMiraParticipantChoice(
      state,
      { accountId: 'alice', admitted: true },
      'leave',
      1000
    );
    expect(record).toEqual({
      meetingId: 'meeting',
      accountId: 'alice',
      noticeVersion: 'synthetic-notice-v1',
      choice: 'leave',
      changedAt: 1000,
      revision: 1,
    });
    expect(canForwardMiraMix(state, [])).toBe(false);
  });
});
