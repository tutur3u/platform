export type MiraPromptDefault = 'continue' | 'mute';
export type MiraParticipantChoice = MiraPromptDefault | 'leave';

export type MiraWorkspaceAttestation = {
  workspaceId: string;
  actorId: string;
  attestedAt: number;
  audience: 'adults-only';
};

export type MiraConsentRecord = {
  meetingId: string;
  accountId: string;
  noticeVersion: string;
  choice: MiraParticipantChoice;
  changedAt: number;
  revision: number;
};

export type MiraConsentPolicy = {
  authorized: boolean;
  workspaceId: string;
  meetingId: string;
  noticeVersion: string;
  attestation: MiraWorkspaceAttestation | null;
  records: Readonly<Record<string, MiraConsentRecord | undefined>>;
};

export function miraPromptDefault(
  workspace: MiraPromptDefault = 'continue',
  meeting?: MiraPromptDefault
): MiraPromptDefault {
  return meeting ?? workspace;
}

export function hasMiraAdultAttestation(
  policy: Pick<MiraConsentPolicy, 'workspaceId' | 'attestation'>
) {
  const attestation = policy.attestation;
  return !!(
    attestation &&
    attestation.workspaceId === policy.workspaceId &&
    attestation.actorId &&
    attestation.audience === 'adults-only' &&
    Number.isSafeInteger(attestation.attestedAt) &&
    attestation.attestedAt > 0
  );
}

export function includesMiraParticipant(
  policy: MiraConsentPolicy,
  accountId: string
) {
  const record = policy.records[accountId];
  return !!(
    policy.authorized &&
    record &&
    record.accountId === accountId &&
    record.meetingId === policy.meetingId &&
    policy.noticeVersion &&
    record.noticeVersion === policy.noticeVersion &&
    record.choice === 'continue' &&
    Number.isSafeInteger(record.changedAt) &&
    record.changedAt > 0 &&
    Number.isSafeInteger(record.revision) &&
    record.revision > 0
  );
}

export function canForwardMiraMix(
  policy: MiraConsentPolicy,
  currentAccountIds: readonly string[]
) {
  return (
    currentAccountIds.length > 0 &&
    currentAccountIds.every((id) => includesMiraParticipant(policy, id))
  );
}

export function recordMiraParticipantChoice(
  policy: MiraConsentPolicy,
  actor: { accountId: string; admitted: boolean },
  choice: MiraParticipantChoice,
  now: number
): MiraConsentRecord | null {
  if (
    !actor.accountId ||
    !actor.admitted ||
    !policy.noticeVersion ||
    !Number.isSafeInteger(now) ||
    now <= 0
  )
    return null;
  const previous = policy.records[actor.accountId];
  const revision =
    previous?.meetingId === policy.meetingId ? previous.revision + 1 : 1;
  if (!Number.isSafeInteger(revision) || revision <= 0) return null;
  return {
    meetingId: policy.meetingId,
    accountId: actor.accountId,
    noticeVersion: policy.noticeVersion,
    choice,
    changedAt: now,
    revision,
  };
}

export function canReceiveMiraAudio(
  policy: MiraConsentPolicy,
  accountId: string,
  currentAccountIds: readonly string[]
) {
  return (
    includesMiraParticipant(policy, accountId) &&
    canForwardMiraMix(policy, currentAccountIds)
  );
}
