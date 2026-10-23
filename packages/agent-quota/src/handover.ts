import { accountKey } from './admission';
import { usageLimitReceiptActive } from './failure-receipt';
import type { HookLedger, SwitchEvidence } from './hooks-types';
import { recommend } from './policy';
import { checkSwitch } from './switch-safety';
import type { AccountUsage } from './types';

export interface HandoverEvidence {
  inThreadSwitchSupported: boolean;
  successorCount: number;
  oldWriterDrainedOrStopped: boolean;
  sourcePreserved: boolean;
  dirtyFilesPreserved: boolean;
  indexPreserved: boolean;
  jobsPreserved: boolean;
  childParentsPreserved: boolean;
  questionsPreserved: boolean;
  watchesPreserved: boolean;
  unknownWritesPreserved: boolean;
  bindingVerified: boolean;
  successorIndependentlyAccepted: boolean;
  acceptanceRecorded: boolean;
}
export function checkHandover(
  ledger: HookLedger,
  current: AccountUsage,
  switching: SwitchEvidence,
  evidence: HandoverEvidence,
  now: Date
) {
  const ranking = recommend({
    accounts: [current],
    active: [],
    task: {},
    now,
    reserves: { claude_hehe: {} },
  }).ranked[0];
  const limited = ledger.observations.some(
    (event) =>
      (event.instanceId === current.instanceId ||
        event.accountKey === accountKey(current)) &&
      event.outcome === 'usage-limit' &&
      usageLimitReceiptActive(event, now)
  );
  if (ranking?.state === 'healthy' && !limited)
    return {
      status: 'pass',
      path: 'stay',
      reasons: ['current-account-healthy'],
      successorRecommended: false,
    };
  const transition = checkSwitch(ledger, switching, now);
  if (evidence.inThreadSwitchSupported && transition.status === 'pass')
    return {
      status: 'pass',
      path: 'in-thread',
      reasons: ['supported-switch-gates-pass'],
      successorRecommended: false,
    };
  const required = [
    ['old-writer-drained-or-stopped', evidence.oldWriterDrainedOrStopped],
    ['source-preserved', evidence.sourcePreserved],
    ['dirty-files-preserved', evidence.dirtyFilesPreserved],
    ['index-preserved', evidence.indexPreserved],
    ['jobs-preserved', evidence.jobsPreserved],
    ['true-child-parents-preserved', evidence.childParentsPreserved],
    ['questions-preserved', evidence.questionsPreserved],
    ['watches-preserved', evidence.watchesPreserved],
    ['unknown-writes-preserved', evidence.unknownWritesPreserved],
    ['workspace-binding-verified', evidence.bindingVerified],
    [
      'successor-independent-acceptance',
      evidence.successorIndependentlyAccepted,
    ],
    [
      'acceptance-recorded-before-predecessor-settles',
      evidence.acceptanceRecorded,
    ],
  ] as const;
  const leaseBlockers = transition.reasons.filter(
    (reason) =>
      reason.startsWith('switch-lease') || reason === 'switch-evidence-stale'
  );
  const reasons = [
    ...leaseBlockers,
    ...required.filter(([, passed]) => !passed).map(([gate]) => gate),
  ];
  if (evidence.successorCount > 1) reasons.push('successor-already-exists');
  if (evidence.successorCount !== 1 && evidence.successorIndependentlyAccepted)
    reasons.push('successor-acceptance-inconsistent');
  return {
    status: reasons.length ? 'block' : 'pass',
    path: 'successor',
    successorRecommended: evidence.successorCount === 0,
    maximumSuccessors: 1,
    reasons,
    requiredGates: required.map(([gate]) => gate),
    switchBlockers: transition.reasons,
    limitations: [
      'Owner launches or reuses one successor with supported workspace binding.',
      'Never reparent children, replay work, or allow duplicate writers.',
      'This check does not launch, settle, or transfer custody.',
    ],
  };
}
