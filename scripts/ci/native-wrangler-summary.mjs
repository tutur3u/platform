import {
  syntaxClosed,
  syntaxClosureComplete,
  syntaxPending,
} from './native-wrangler-observable.mjs';

const observedOutcome = 'EXPECTED_USER_STARTUP_REJECTION_OBSERVED';

export function casePhaseSummary(
  name,
  receipt,
  exit,
  classification,
  result,
  persisted,
  receiptStatus = 'notrun'
) {
  const names = [
    'wrongModule',
    'graphEscape',
    'wrongType',
    'nodeBuiltin',
    'syntax',
    'positive',
    'sdkResidual',
    'originalMutation',
    'copyMutation',
    'removalFailure',
    'graphValid',
    'nodeBuiltinEnabled',
    'preload',
  ];
  const phases = [
    'residual',
    'originalSeal',
    'copySeal',
    'foreign',
    'snapshot',
    'removal',
  ];
  const state = (value) =>
    value === true ? 'ok' : value === false ? 'fail' : 'notrun';
  const closed =
    receiptStatus === 'ok' &&
    classification === observedOutcome &&
    exit?.code === 0 &&
    exit.signal === null &&
    persisted &&
    result.errors.length === 0 &&
    phases.every((key) => result.phases[key]?.ok === true);
  const known = [
    observedOutcome,
    'ORDINARY_SUCCESS',
    'PROVEN_PRESTART_PRELOAD_REJECTION',
  ];
  const syntaxComplete =
    name === 'syntax' &&
    classification === syntaxPending &&
    syntaxClosureComplete(receipt, exit, result, persisted, receiptStatus);
  const outcome = syntaxComplete
    ? syntaxClosed
    : closed
      ? `${observedOutcome}_WITH_CLOSED_PROCESS`
      : known.includes(classification)
        ? classification
        : 'NOTPASS';
  return [
    'native-case',
    `case=${names.includes(name) ? name : 'unknown'}`,
    `exit=${Number.isInteger(exit?.code) && exit.code >= 0 && exit.code <= 255 ? exit.code : 'unknown'}`,
    `signal=${exit?.signal === null ? 'null' : 'other'}`,
    `classification=${outcome}`,
    ...(name === 'syntax'
      ? ['internalCleanup=UNKNOWN', 'descendantClosure=UNKNOWN']
      : []),
    `receipt=${['ok', 'fail', 'notrun'].includes(receiptStatus) ? receiptStatus : 'notrun'}`,
    ...[
      'workerReturned',
      'readyFulfilled',
      'readyRejected',
      'disposeAttempted',
      'disposeSettled',
      'predicateMatched',
    ].map((key) => `${key}=${state(receipt?.facts?.[key])}`),
    ...phases.map((key) => `${key}=${state(result.phases[key]?.ok)}`),
    `snapshotVerified=${state(result.phases.snapshot?.ok === true && Boolean(result.snapshot?.seal))}`,
    `persistence=${state(persisted)}`,
    `preReturnCleanup=${name === 'syntax' ? 'UNKNOWN' : 'notrun'}`,
  ].join(' ');
}
