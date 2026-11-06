import { createHash } from 'node:crypto';
import { assertStrictTap } from './programming-database-tap.mjs';

export const foundationPackets = Object.freeze([
  ['employee-signup-guards.sql', 25],
  ['employee-administrator.sql', 20],
  ['employee-finalization.sql', 34],
  ['employee-identity-contract.sql', 52],
  ['employee-restoration.sql', 41],
]);
export const journalPackets = Object.freeze([
  ...foundationPackets,
  ['employee-creation-operations.sql', 48],
  ['employee-creation-reserved-preflight.sql', 61],
  ['employee-runtime-observation.sql', 20],
  ['employee-rejection-adjudication.sql', 23],
]);

export const personalJournalPackets = Object.freeze([
  ...foundationPackets,
  ['personal-journal.sql', 24],
]);

export const feedbackPackets = Object.freeze([
  Object.freeze(['product-feedback-intake.sql', 34]),
  Object.freeze(['product-feedback-staff-inbox.sql', 41]),
  Object.freeze(['product-feedback-staff-eligibility.sql', 31]),
]);

export function selectFeedback(value) {
  if (![undefined, 'false', 'true'].includes(value))
    throw new Error('Invalid feedback qualification selection');
  return value === 'true';
}

export function selectAddressMigration(value) {
  if (![undefined, 'false', 'true'].includes(value))
    throw new Error('Invalid address migration qualification selection');
  return value === 'true';
}

export function selectSchemaPackets(
  journal = false,
  personalJournal = false,
  addressMigration = false,
  feedback = false,
  chatInitialSettings = false
) {
  if (
    typeof journal !== 'boolean' ||
    typeof personalJournal !== 'boolean' ||
    typeof addressMigration !== 'boolean' ||
    typeof feedback !== 'boolean' ||
    typeof chatInitialSettings !== 'boolean' ||
    (chatInitialSettings &&
      (journal || personalJournal || addressMigration || feedback)) ||
    (feedback && (journal || personalJournal || addressMigration)) ||
    (personalJournal && (journal || addressMigration))
  )
    throw new Error('Select one optional schema profile');
  return [
    ...(personalJournal
      ? personalJournalPackets
      : journal
        ? journalPackets
        : foundationPackets),
    ...(addressMigration
      ? [
          ['employee-google-destination-migration.sql', 30],
          ['employee-address-migration.sql', 10],
          ['employee-retained-mailbox-adoption.sql', 41],
        ]
      : []),
    ...(feedback ? feedbackPackets : []),
    ...(chatInitialSettings ? [['chat-initial-ai-settings.sql', 25]] : []),
  ];
}

export function exactSourceSha(value) {
  if (!/^[a-f0-9]{40}$/u.test(value ?? '')) {
    throw new Error('An exact source commit is required');
  }
  return value;
}

export function assertRollbackSource(sql) {
  const statements = sql
    .replace(/^\\(?:ir|if|else|endif|quit).*$/gmu, '')
    .replace(/--[^\n]*/gu, '')
    .trim();
  if (
    !/^begin\s*;/iu.test(statements) ||
    !/select\s+\*\s+from\s+finish\(\)\s*;\s*rollback\s*;$/iu.test(statements) ||
    /\bcommit\s*;/iu.test(statements)
  ) {
    throw new Error('Fixture must close with finish and rollback');
  }
}

export function assertPacketTap(tap, expected) {
  if (Buffer.byteLength(tap, 'utf8') > 1024 * 1024) {
    throw new Error('Fixture output exceeds the bound');
  }
  assertStrictTap(tap);
  const plan = [...tap.matchAll(/^1\.\.(\d+)$/gm)];
  if (
    Number(plan[0][1]) !== expected ||
    tap.split(/\r?\n/u).filter((line) => line === 'BEGIN').length !== 1 ||
    tap.split(/\r?\n/u).filter((line) => line === 'ROLLBACK').length !== 1 ||
    /^COMMIT$/mu.test(tap)
  ) {
    throw new Error('Fixture count or rollback closure differs');
  }
  return expected;
}

export function schemaReceipt({
  sourceSha,
  packets,
  lifecycleCode,
  cleanupSucceeded,
  journal = false,
  personalJournal = false,
  addressMigration = false,
  feedback = false,
  chatInitialSettings = false,
  chatInitialSettingsQualified = false,
  generatedTypesSha256 = null,
}) {
  const expected = selectSchemaPackets(
    journal,
    personalJournal,
    addressMigration,
    feedback,
    chatInitialSettings
  ).map(([file, assertions]) => ({
    file,
    assertions,
  }));
  const passed =
    lifecycleCode === 0 &&
    cleanupSucceeded === true &&
    (!addressMigration || /^[a-f0-9]{64}$/u.test(generatedTypesSha256 ?? '')) &&
    (!chatInitialSettings || chatInitialSettingsQualified === true) &&
    JSON.stringify(packets) === JSON.stringify(expected);
  return {
    version: 1,
    sourceSha: exactSourceSha(sourceSha),
    scope: chatInitialSettings
      ? 'chat-initial-settings'
      : personalJournal
        ? 'personal-journal'
        : `${journal ? 'employee-creation-restoration-journal' : 'employee-creation-restoration'}${addressMigration ? '-address-migration' : ''}${feedback ? '-feedback' : ''}`,
    schemaQualified: passed,
    assertions: packets.reduce((sum, packet) => sum + packet.assertions, 0),
    packets,
    lifecycleCode,
    cleanupSucceeded,
    nativeBackendQualified: false,
    providerQualified: false,
    productionApplied: false,
  };
}

export function failedAssertionOrdinals(tap, expected) {
  if (
    typeof tap !== 'string' ||
    Buffer.byteLength(tap, 'utf8') > 1024 * 1024 ||
    !Number.isSafeInteger(expected) ||
    expected < 0 ||
    expected > 500
  ) {
    throw new Error('Invalid bounded TAP diagnostic');
  }
  const ordinals = [];
  for (const line of tap.split(/\r?\n/u)) {
    if (!/^not ok\b/u.test(line)) continue;
    const match = /^not ok ([1-9]\d*)(?: - .*)?$/u.exec(line);
    const ordinal = match ? Number(match[1]) : NaN;
    if (
      !Number.isSafeInteger(ordinal) ||
      ordinal > expected ||
      ordinal <= (ordinals.at(-1) ?? 0)
    ) {
      throw new Error('Invalid failed assertion ordinal');
    }
    ordinals.push(ordinal);
  }
  return ordinals;
}

const signupFailureContracts = new Map([
  [22, 'Employee creation intent is missing'],
  [23, 'Employee creation must remain confirmed and pending'],
]);

const signupMessageCategories = new Map([
  ['Employee creation intent is missing', 'expected_intent_missing'],
  [
    'Employee creation must remain confirmed and pending',
    'expected_pending_required',
  ],
  [
    'Employee creation intent does not match identity',
    'intent_identity_mismatch',
  ],
  ['Employee onboarding registry is missing', 'registry_missing'],
]);

// PostgreSQL CHECK messages omit schema; only fixed relation/constraint pairs
// derived from the frozen creation migration may produce diagnostic categories.
const signupConstraintCategories = new Map([
  [
    'employee_creation_intents.employee_creation_intents_staff_email_check',
    'intent_staff_email_check',
  ],
  [
    'employee_creation_intents.employee_creation_intents_managed_name_check',
    'intent_managed_name_check',
  ],
  [
    'infrastructure_employees.infrastructure_employees_staff_email_check',
    'employee_staff_email_check',
  ],
  [
    'infrastructure_employees.infrastructure_employees_managed_name_check',
    'employee_managed_name_check',
  ],
  [
    'infrastructure_employees.infrastructure_employees_lifecycle_state_check',
    'employee_lifecycle_check',
  ],
  [
    'infrastructure_employees.infrastructure_employees_check',
    'employee_recovery_check',
  ],
]);

function signupConstraintCategory(code, message) {
  if (code !== '23514') return 'other_redacted';
  const match =
    /^new row for relation "([a-z_]+)" violates check constraint "([a-z_]+)"$/u.exec(
      message
    );
  return match
    ? (signupConstraintCategories.get(`${match[1]}.${match[2]}`) ??
        'other_redacted')
    : 'other_redacted';
}

export function signupCaughtDiagnostics(tap, ordinals) {
  if (
    typeof tap !== 'string' ||
    Buffer.byteLength(tap, 'utf8') > 1024 * 1024 ||
    !Array.isArray(ordinals) ||
    JSON.stringify(failedAssertionOrdinals(tap, 25)) !==
      JSON.stringify(ordinals)
  ) {
    throw new Error('Invalid signup diagnostic binding');
  }
  const lines = tap.split(/\r?\n/u);
  return ordinals
    .filter((ordinal) => signupFailureContracts.has(ordinal))
    .map((ordinal) => {
      const empty = {
        ordinal,
        diagnosticValid: false,
        actualSqlstate: null,
        expectedSqlstate: '23514',
        expectedMessageMatches: null,
        noException: null,
        messageCategory: null,
        constraintCategory: null,
      };
      const start = lines.findIndex((line) =>
        new RegExp(`^not ok ${ordinal}(?: - .*)?$`, 'u').test(line)
      );
      const next = lines.findIndex(
        (line, index) => index > start && /^(?:not ok |ok |1\.\.)/u.test(line)
      );
      const block = lines.slice(start + 1, next < 0 ? lines.length : next);
      const headers = block.filter((line) => /^#\s*Failed test\b/u.test(line));
      const caught = block.filter((line) => /^#\s*caught\s*:/u.test(line));
      const wanted = block.filter((line) => /^#\s*wanted\s*:/u.test(line));
      if (
        headers.length !== 1 ||
        !new RegExp(`^#\\s*Failed test ${ordinal}:`, 'u').test(headers[0]) ||
        caught.length !== 1 ||
        wanted.length !== 1 ||
        block.indexOf(wanted[0]) !== block.indexOf(caught[0]) + 1 ||
        wanted[0].replace(/^#\s*wanted: /u, '') !==
          `23514: ${signupFailureContracts.get(ordinal)}`
      ) {
        return empty;
      }
      const match = /^#\s*caught: ([0-9A-Z]{5}): (.*)$/u.exec(caught[0]);
      if (!match) return empty;
      return {
        ...empty,
        diagnosticValid: true,
        actualSqlstate: match[1],
        expectedMessageMatches:
          match[2] === signupFailureContracts.get(ordinal),
        noException: false,
        messageCategory:
          signupMessageCategories.get(match[2]) ?? 'other_redacted',
        constraintCategory: signupConstraintCategory(match[1], match[2]),
      };
    });
}

export function schemaFailureDiagnostic(
  phase,
  packetOrdinal,
  result = {},
  journal = false,
  personalJournal = false,
  addressMigration = false,
  feedback = false,
  chatInitialSettings = false
) {
  const packets = selectSchemaPackets(
    journal,
    personalJournal,
    addressMigration,
    feedback,
    chatInitialSettings
  );
  const phases = [
    'full-schema-snapshot',
    'start',
    'reset',
    'feedback-causal',
    'fixture-hash',
    'packet-copy',
    'packet-execution',
    'packet-tap',
    'typegen',
    'http-runtime',
    'chat-bridge',
    'cleanup',
    'cleanup-proof',
  ];
  if (
    !phases.includes(phase) ||
    !Number.isInteger(packetOrdinal) ||
    packetOrdinal < 0 ||
    packetOrdinal > packets.length
  ) {
    throw new Error('Invalid schema diagnostic binding');
  }
  const status =
    Number.isInteger(result.status) &&
    result.status >= 0 &&
    result.status <= 255
      ? result.status
      : null;
  const tap =
    typeof result.stdout === 'string' &&
    Buffer.byteLength(result.stdout, 'utf8') <= 1024 * 1024
      ? result.stdout
      : '';
  const failingAssertions = Math.min(
    500,
    tap.split(/\r?\n/u).filter((line) => /^not ok \d+(?:\s|$)/u.test(line))
      .length
  );
  let failedOrdinals = [];
  let assertionOrdinalsValid = true;
  try {
    failedOrdinals = failedAssertionOrdinals(
      result.stdout ?? '',
      packets[packetOrdinal - 1]?.[1] ?? 0
    );
    if (failedOrdinals.length !== failingAssertions) {
      throw new Error('Failed ordinal count differs');
    }
  } catch {
    assertionOrdinalsValid = false;
    failedOrdinals = [];
  }
  let signupExceptions = [];
  if (phase === 'packet-tap' && packetOrdinal === 1 && assertionOrdinalsValid) {
    signupExceptions = signupCaughtDiagnostics(tap, failedOrdinals);
  }
  const stderr =
    typeof result.stderr === 'string' &&
    Buffer.byteLength(result.stderr) <= 1048576
      ? result.stderr
      : '';
  const errors = [
    ...stderr.matchAll(
      /^psql:\/tmp\/employee-schema-contract\.sql:([1-9]\d{0,3}): ERROR: {2}([^\r\n]{1,4096})$/gm
    ),
  ];
  const error = errors.length === 1 ? errors[0] : null;
  return {
    phase,
    packetOrdinal,
    exitCode: status,
    processError: result.error != null,
    timedOut: result.error?.code === 'ETIMEDOUT',
    signaled: Boolean(result.signal),
    failingAssertions,
    failedAssertionOrdinals: failedOrdinals,
    assertionOrdinalsValid,
    signupExceptions,
    sqlSourceLine: error ? Number(error[1]) : null,
    sqlErrorMessageSha256: error
      ? createHash('sha256').update(error[2]).digest('hex')
      : null,
    bailout: /^Bail out!/mu.test(tap),
    skippedOrTodo: /#\s*(?:SKIP|TODO)\b/iu.test(tap),
  };
}
