import { isDeepStrictEqual } from 'node:util';

// Pure transcript/control harness. Execution and resource admission belong to
// the caller; there is deliberately no URL, process runner or database fallback.
const verificationError = 'Hidden workspace verification failed:';
const restoreDelete =
  "delete from public.user_workspace_configs where id='HIDDEN_WORKSPACE';";

function successfulProcess(result) {
  if (result.exitCode !== 0 || result.signal) {
    throw new Error('psql did not complete successfully');
  }
}

function lines(result) {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`.split(/\r?\n/);
}

function record(result, prefix) {
  const matches = lines(result)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix));
  if (matches.length !== 1) throw new Error(`Expected one ${prefix} record`);
  return JSON.parse(matches[0].slice(prefix.length));
}

export function validateFixtureTranscript(
  result,
  expectedCount,
  metadata = false
) {
  successfulProcess(result);
  if (![15, 26].includes(expectedCount))
    throw new Error('Unsupported fixture count');
  const assertions = lines(result)
    .map((line) => line.trim().replace(/^NOTICE:\s*/, ''))
    .filter((line) => line.startsWith('ASSERT '));
  const seen = new Set();
  for (const assertion of assertions) {
    const match = /^ASSERT ([0-9]+): true(?: |$)/.exec(assertion);
    if (!match) throw new Error(`Unsuccessful assertion: ${assertion}`);
    const number = Number(match[1]);
    if (number < 1 || number > expectedCount || seen.has(number)) {
      throw new Error('Unexpected or duplicate assertion number');
    }
    seen.add(number);
  }
  if (seen.size !== expectedCount)
    throw new Error('Missing fixture assertions');
  if (metadata) {
    const events = record(result, 'HIDDEN_EVENT_COUNTS:');
    if (
      events.unchanged !== true ||
      !events.before ||
      !events.after ||
      !isDeepStrictEqual(events.before, events.after)
    ) {
      throw new Error('Hidden preference operations changed event counts');
    }
    const storage = record(result, 'STORAGE_METADATA:');
    const tables = storage.tables?.map((table) => table.name).sort();
    if (
      !isDeepStrictEqual(tables, ['user_configs', 'user_workspace_configs']) ||
      !Array.isArray(storage.publications) ||
      storage.publications.length !== 0 ||
      !Array.isArray(storage.triggers)
    ) {
      throw new Error('Unexpected private preference storage metadata');
    }
  }
  return { assertions: seen.size };
}

export function assertionFailureControl(value) {
  if (!['false', 'null'].includes(value))
    throw new Error('Unsupported control');
  return `\\set ON_ERROR_STOP on\nbegin;\ndo $assert$\ndeclare check_result text;\nbegin\n  select 'ASSERT 1: ' || (${value})::text into check_result;\n  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then\n    raise exception '${verificationError} %', check_result;\n  end if;\n  raise notice '%', check_result;\nend;\n$assert$;\nrollback;\n`;
}

export function skippedRestoreControl(privacySql) {
  if (privacySql.split(restoreDelete).length !== 2) {
    throw new Error('Expected exactly one owner restore DELETE');
  }
  return privacySql.replace(
    restoreDelete,
    restoreDelete.replace(';', ' and false;')
  );
}

export function validateExpectedFailure(result, assertion) {
  if (
    !Number.isInteger(result.exitCode) ||
    result.exitCode === 0 ||
    result.signal
  ) {
    throw new Error('Failure control did not exit with a SQL error');
  }
  const expected = assertion === null ? '<NULL>' : `ASSERT ${assertion}: false`;
  if (
    !lines(result).some(
      (line) =>
        line.trim() === `ERROR:  ${verificationError} ${expected}` ||
        (assertion !== null &&
          line.trim().startsWith(`ERROR:  ${verificationError} ${expected} `))
    )
  ) {
    throw new Error('Failure control failed for an unrelated reason');
  }
}

export const rollbackSql = `select 'HIDDEN_ROLLBACK: ' || jsonb_build_object(
  'users', (select count(*) from auth.users where id in (
    '00000000-0000-4000-8000-000000009901',
    '00000000-0000-4000-8000-000000009902',
    '00000000-0000-4000-8000-000000009903')),
  'workspaces', (select count(*) from public.workspaces
    where id='00000000-0000-4000-8000-000000009910'))::text;`;

function validateRollback(result) {
  successfulProcess(result);
  if (
    !isDeepStrictEqual(record(result, 'HIDDEN_ROLLBACK:'), {
      users: 0,
      workspaces: 0,
    })
  )
    throw new Error('Synthetic fixture rows remain');
}

// execute must open and close a fresh psql session per call. Admission is an
// explicit parent-owned capability, not inferred from an environment variable.
export async function verifyHiddenWorkspaces({
  admission,
  execute,
  privacySql,
  guestSql,
}) {
  if (
    admission?.isolated !== true ||
    admission?.parentApproved !== true ||
    !admission?.projectId ||
    typeof execute !== 'function'
  ) {
    throw new Error('Parent-admitted isolated executor required');
  }
  const jobs = [
    ['privacy', privacySql, (result) => validateFixtureTranscript(result, 15)],
    [
      'board-guests',
      guestSql,
      (result) => validateFixtureTranscript(result, 26, true),
    ],
    [
      'false-control',
      assertionFailureControl('false'),
      (result) => validateExpectedFailure(result, 1),
    ],
    [
      'null-control',
      assertionFailureControl('null'),
      (result) => validateExpectedFailure(result, null),
    ],
    [
      'skipped-restore-control',
      skippedRestoreControl(privacySql),
      (result) => validateExpectedFailure(result, 13),
    ],
  ];
  const completed = [];
  for (const [name, sql, validate] of jobs) {
    try {
      validate(await execute({ name, sql, projectId: admission.projectId }));
    } finally {
      // Failure aborts its transaction when that session closes. Check using a
      // separate owner session even when validation rejects the transcript.
      validateRollback(
        await execute({
          name: `${name}-rollback`,
          sql: rollbackSql,
          projectId: admission.projectId,
        })
      );
    }
    completed.push(name);
  }
  return completed;
}
