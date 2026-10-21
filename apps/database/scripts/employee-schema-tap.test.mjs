import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPacketTap,
  assertRollbackSource,
  exactSourceSha,
  failedAssertionOrdinals,
  foundationPackets,
  journalPackets,
  personalJournalPackets,
  schemaFailureDiagnostic,
  schemaReceipt,
  selectAddressMigration,
  selectSchemaPackets,
  signupCaughtDiagnostics,
} from './employee-schema-tap.mjs';

const tap = (count) =>
  [
    'BEGIN',
    ...Array.from({ length: count }, (_, i) => `ok ${i + 1} - assertion`),
    `1..${count}`,
    'ROLLBACK',
    '',
  ].join('\n');
const packets = foundationPackets.map(([file, assertions]) => ({
  file,
  assertions,
}));
const receipt = (extra = {}) =>
  schemaReceipt({
    sourceSha: 'a'.repeat(40),
    packets,
    lifecycleCode: 0,
    cleanupSucceeded: true,
    ...extra,
  });
test('accepts exactly all 172 closed assertions', () => {
  for (const [, count] of foundationPackets)
    assert.equal(assertPacketTap(tap(count), count), count);
  assert.equal(receipt().assertions, 172);
  assert.equal(receipt().schemaQualified, true);
});
test('journal selection requires all 324 assertions and successful cleanup', () => {
  const all = journalPackets.map(([file, assertions]) => ({
    file,
    assertions,
  }));
  assert.equal(receipt({ journal: true }).schemaQualified, false);
  assert.equal(receipt({ packets: all }).schemaQualified, false);
  assert.equal(receipt({ journal: true, packets: all }).schemaQualified, true);
  assert.equal(receipt({ journal: true, packets: all }).assertions, 324);
  assert.equal(
    receipt({ journal: true, packets: all, cleanupSucceeded: false })
      .schemaQualified,
    false
  );
  assert.equal(
    receipt({ journal: true, packets: all.slice(0, 6) }).schemaQualified,
    false
  );
});
test('rejects a different plan count', () =>
  assert.throws(() => assertPacketTap(tap(24), 25)));
test('rejects truncated TAP', () =>
  assert.throws(() =>
    assertPacketTap(tap(2).replace('ok 2 - assertion\n', ''), 2)
  ));
test('rejects failing assertions', () =>
  assert.throws(() => assertPacketTap(tap(2).replace('ok 2', 'not ok 2'), 2)));
test('rejects skipped assertions', () =>
  assert.throws(() =>
    assertPacketTap(tap(1).replace('assertion', 'assertion # SKIP'), 1)
  ));
test('rejects TODO assertions', () =>
  assert.throws(() =>
    assertPacketTap(tap(1).replace('assertion', 'assertion # TODO'), 1)
  ));
test('rejects duplicate numbers', () =>
  assert.throws(() => assertPacketTap(tap(2).replace('ok 2', 'ok 1'), 2)));
test('rejects multiple plans and bailout', () => {
  assert.throws(() => assertPacketTap(`${tap(1)}1..1\n`, 1));
  assert.throws(() => assertPacketTap(`${tap(1)}Bail out!\n`, 1));
});
test('requires observed rollback and forbids commit', () => {
  assert.throws(() => assertPacketTap(tap(1).replace('ROLLBACK', ''), 1));
  assert.throws(() => assertPacketTap(tap(1).replace('ROLLBACK', 'COMMIT'), 1));
});
test('rejects duplicate transaction closure', () =>
  assert.throws(() => assertPacketTap(`${tap(1)}ROLLBACK\n`, 1)));
test('rejects output beyond private bound', () =>
  assert.throws(() => assertPacketTap('a'.repeat(1048577), 1)));
test('requires rollback source', () => {
  assert.doesNotThrow(() =>
    assertRollbackSource('begin; select * from finish(); rollback;')
  );
  assert.throws(() =>
    assertRollbackSource('begin; select * from finish(); commit;')
  );
});
test('rejects partial packets despite successful cleanup', () =>
  assert.equal(
    receipt({ packets: packets.slice(0, 4) }).schemaQualified,
    false
  ));
test('rejects cleanup or lifecycle failure after successful assertions', () => {
  assert.equal(receipt({ cleanupSucceeded: false }).schemaQualified, false);
  assert.equal(receipt({ lifecycleCode: 1 }).schemaQualified, false);
});
test('does not promote schema proof into provider or production proof', () => {
  assert.equal(receipt().nativeBackendQualified, false);
  assert.equal(receipt().providerQualified, false);
  assert.equal(receipt().productionApplied, false);
});
test('rejects branch names or abbreviated commits', () => {
  assert.throws(() => exactSourceSha('main'));
  assert.throws(() => exactSourceSha('9e7'));
});

test('schema failure diagnostic exposes only fixed fields and ordinal', () => {
  const diagnostic = schemaFailureDiagnostic('packet-execution', 1, {
    status: 3,
    error: { code: 'SECRET', message: 'password=private' },
    signal: 'PRIVATE',
    stdout: 'ERROR: private SQL',
    stderr: 'secret-token',
  });
  assert.equal(diagnostic.exitCode, 3);
  assert.equal(diagnostic.processError, true);
  assert.equal(diagnostic.signaled, true);
  assert.equal(JSON.stringify(diagnostic).includes('private'), false);
  assert.equal(JSON.stringify(diagnostic).includes('SECRET'), false);
});
test('schema failure diagnostic retains no TAP assertion descriptions', () => {
  const diagnostic = schemaFailureDiagnostic('packet-tap', 1, {
    stdout:
      'not ok 1 - PRIVATE USER\nBail out! secret-token\nok 2 # SKIP private\n',
  });
  assert.equal(diagnostic.failingAssertions, 1);
  assert.equal(diagnostic.bailout, true);
  assert.equal(diagnostic.skippedOrTodo, true);
  assert.equal(JSON.stringify(diagnostic).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(diagnostic).includes('secret-token'), false);
});
test('schema failure diagnostic bounds private output parsing', () => {
  const diagnostic = schemaFailureDiagnostic('packet-tap', 1, {
    stdout: `not ok 1 - private\n${'x'.repeat(1048576)}`,
  });
  assert.equal(diagnostic.failingAssertions, 0);
});
test('schema failure diagnostic preserves timeout without raw error text', () => {
  assert.equal(
    schemaFailureDiagnostic('start', 0, {
      error: { code: 'ETIMEDOUT', message: 'private command' },
    }).timedOut,
    true
  );
});
test('schema failure diagnostic rejects untrusted phase or ordinal', () => {
  assert.throws(() => schemaFailureDiagnostic('secret', 1));
  assert.throws(() => schemaFailureDiagnostic('packet-tap', 6));
  assert.throws(() => schemaFailureDiagnostic('packet-tap', '1'));
});
test('journal diagnostics bind packets six and seven without exposing SQL text', () => {
  const diagnostic = schemaFailureDiagnostic(
    'packet-execution',
    7,
    {
      stderr:
        'psql:/tmp/employee-schema-contract.sql:42: ERROR:  PRIVATE VALUE\n',
      stdout: 'not ok 61 - private assertion\n',
    },
    true
  );
  assert.equal(diagnostic.sqlSourceLine, 42);
  assert.match(diagnostic.sqlErrorMessageSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(diagnostic.failedAssertionOrdinals, [61]);
  assert.equal(JSON.stringify(diagnostic).includes('PRIVATE VALUE'), false);
  assert.throws(() =>
    schemaFailureDiagnostic('packet-execution', 10, {}, true)
  );
});
test('schema failure diagnostic sanitizes unknown exit statuses', () => {
  for (const status of ['secret', -1, 256]) {
    assert.equal(
      schemaFailureDiagnostic('packet-execution', 1, { status }).exitCode,
      null
    );
  }
});
test('cleanup diagnostics use no fixture ordinal and retain no container name', () => {
  const diagnostic = schemaFailureDiagnostic('cleanup-proof', 0, {
    stderr: 'supabase_db_PRIVATE',
  });
  assert.equal(diagnostic.packetOrdinal, 0);
  assert.equal(JSON.stringify(diagnostic).includes('PRIVATE'), false);
});

test('failed assertion ordinals preserve numeric positions and count', () => {
  const diagnostic = schemaFailureDiagnostic('packet-tap', 1, {
    stdout: 'not ok 3 - first failure\nnot ok 21 - second failure\n',
  });
  assert.deepEqual(diagnostic.failedAssertionOrdinals, [3, 21]);
  assert.equal(diagnostic.assertionOrdinalsValid, true);
  assert.equal(diagnostic.failingAssertions, 2);
});
test('failed assertion ordinals retain no private descriptions or values', () => {
  const diagnostic = schemaFailureDiagnostic('packet-tap', 1, {
    stdout: 'not ok 2 - password=PRIVATE\n# have: PRIVATE\n# want: SECRET\n',
  });
  assert.deepEqual(diagnostic.failedAssertionOrdinals, [2]);
  assert.equal(JSON.stringify(diagnostic).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(diagnostic).includes('SECRET'), false);
});
test('failed assertion ordinals reject duplicates or reversed order', () => {
  for (const tap of ['not ok 2\nnot ok 2', 'not ok 3\nnot ok 2']) {
    assert.throws(() => failedAssertionOrdinals(tap, 25));
    const diagnostic = schemaFailureDiagnostic('packet-tap', 1, {
      stdout: tap,
    });
    assert.deepEqual(diagnostic.failedAssertionOrdinals, []);
    assert.equal(diagnostic.assertionOrdinalsValid, false);
  }
});
test('failed assertion ordinals reject out of range and unsafe integers', () => {
  for (const tap of ['not ok 26', 'not ok 0', 'not ok 9007199254740993']) {
    assert.throws(() => failedAssertionOrdinals(tap, 25));
    assert.equal(
      schemaFailureDiagnostic('packet-tap', 1, {
        stdout: tap,
      }).assertionOrdinalsValid,
      false
    );
  }
});
test('failed assertion ordinals reject malformed numeric TAP', () => {
  for (const tap of [
    'not ok',
    'not ok -1',
    'not ok 01',
    'not ok 1x',
    'not ok 1.5',
    'not ok 1 PRIVATE',
    'not ok 1\t- PRIVATE',
  ]) {
    assert.throws(() => failedAssertionOrdinals(tap, 25));
    const diagnostic = schemaFailureDiagnostic('packet-tap', 1, {
      stdout: tap,
    });
    assert.equal(diagnostic.assertionOrdinalsValid, false);
    assert.deepEqual(diagnostic.failedAssertionOrdinals, []);
  }
});
test('failed assertion ordinals enforce packet binding and agreement', () => {
  assert.deepEqual(failedAssertionOrdinals('ok 1\n# not ok 2', 25), []);
  assert.throws(() => failedAssertionOrdinals('not ok 1', 0));
  assert.throws(() => failedAssertionOrdinals('', '25'));
  const diagnostic = schemaFailureDiagnostic('packet-tap', 0, {
    stdout: 'not ok 1',
  });
  assert.equal(diagnostic.failingAssertions, 1);
  assert.equal(diagnostic.assertionOrdinalsValid, false);
  assert.deepEqual(diagnostic.failedAssertionOrdinals, []);
});
test('failed assertion ordinals deny oversized output without raw leakage', () => {
  const tap = `not ok 1 - PRIVATE\n${'x'.repeat(1048576)}`;
  assert.throws(() => failedAssertionOrdinals(tap, 25));
  const diagnostic = schemaFailureDiagnostic('packet-tap', 1, { stdout: tap });
  assert.equal(diagnostic.assertionOrdinalsValid, false);
  assert.deepEqual(diagnostic.failedAssertionOrdinals, []);
  assert.equal(JSON.stringify(diagnostic).includes('PRIVATE'), false);
});

const caughtTap = (ordinal, code, message) =>
  `not ok ${ordinal} - PRIVATE description\n# Failed test ${ordinal}: "PRIVATE"\n#       caught: ${code}: ${message}\n#       wanted: 23514: ${ordinal === 22 ? 'Employee creation intent is missing' : 'Employee creation must remain confirmed and pending'}\n`;
test('signup caught diagnostic recognizes both fixed contracts', () => {
  for (const [ordinal, message] of [
    [22, 'Employee creation intent is missing'],
    [23, 'Employee creation must remain confirmed and pending'],
  ]) {
    const [value] = signupCaughtDiagnostics(
      caughtTap(ordinal, '23514', message),
      [ordinal]
    );
    assert.equal(value.actualSqlstate, '23514');
    assert.equal(value.expectedMessageMatches, true);
    assert.equal(value.diagnosticValid, true);
    assert.equal(value.noException, false);
  }
});
test('signup caught diagnostic distinguishes another SQLSTATE', () => {
  const [value] = signupCaughtDiagnostics(
    caughtTap(22, '42501', 'Employee creation intent is missing'),
    [22]
  );
  assert.equal(value.actualSqlstate, '42501');
  assert.equal(value.expectedMessageMatches, true);
  assert.equal(value.expectedSqlstate, '23514');
});
test('signup caught diagnostic exposes no unexpected sensitive message', () => {
  const tap = caughtTap(23, '23514', 'password=PRIVATE token=SECRET');
  const value = schemaFailureDiagnostic('packet-tap', 1, { stdout: tap });
  assert.equal(value.signupExceptions[0].expectedMessageMatches, false);
  for (const text of [
    'PRIVATE',
    'SECRET',
    'password',
    'token',
    'caught:',
    'wanted:',
  ]) {
    assert.equal(JSON.stringify(value).includes(text), false);
  }
});
test('signup caught diagnostic denies missing or unknown caught formats', () => {
  for (const line of [
    '# caught: no exception',
    '# caught: PRIVATE',
    '# caught: 123: PRIVATE',
  ]) {
    const tap = `not ok 22\n# Failed test 22: "PRIVATE"\n${line}\n`;
    const [value] = signupCaughtDiagnostics(tap, [22]);
    assert.equal(value.diagnosticValid, false);
    assert.equal(value.actualSqlstate, null);
    assert.equal(value.expectedMessageMatches, null);
    assert.equal(value.noException, null);
  }
});
test('signup caught diagnostic denies duplicate or mismatched headers', () => {
  const tap = caughtTap(22, '23514', 'PRIVATE');
  for (const bad of [
    `${tap}# caught: 23514: PRIVATE\n`,
    tap.replace('Failed test 22:', 'Failed test 23:'),
    `${tap}# Failed test 22: "PRIVATE"\n`,
    tap.replace(
      '#       wanted:',
      '# PRIVATE multiline continuation\n#       wanted:'
    ),
  ]) {
    assert.equal(signupCaughtDiagnostics(bad, [22])[0].diagnosticValid, false);
  }
});
test('signup caught diagnostic is restricted to packet one ordinals22 and23', () => {
  assert.deepEqual(
    signupCaughtDiagnostics(caughtTap(21, '23514', 'PRIVATE'), [21]),
    []
  );
  assert.deepEqual(
    schemaFailureDiagnostic('packet-tap', 2, {
      stdout: caughtTap(22, '23514', 'PRIVATE'),
    }).signupExceptions,
    []
  );
  assert.deepEqual(
    schemaFailureDiagnostic('packet-execution', 1, {
      stdout: caughtTap(22, '23514', 'PRIVATE'),
    }).signupExceptions,
    []
  );
});
test('signup caught diagnostic rejects oversized output and ordinal injection', () => {
  assert.throws(() => signupCaughtDiagnostics('x'.repeat(1048577), []));
  assert.throws(() =>
    signupCaughtDiagnostics(caughtTap(22, '23514', 'PRIVATE'), [23])
  );
  assert.throws(() => signupCaughtDiagnostics('not ok 22\nnot ok 22', [22]));
});
test('signup caught diagnostic keeps separate failure block bindings', () => {
  const tap =
    caughtTap(22, '23514', 'Employee creation intent is missing') +
    caughtTap(23, '23505', 'PRIVATE');
  const values = signupCaughtDiagnostics(tap, [22, 23]);
  assert.deepEqual(
    values.map((value) => value.actualSqlstate),
    ['23514', '23505']
  );
  assert.deepEqual(
    values.map((value) => value.expectedMessageMatches),
    [true, false]
  );
});

test('signup fixed message category recognizes only declared owned literals', () => {
  const cases = [
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
  ];
  for (const [message, category] of cases) {
    const [value] = signupCaughtDiagnostics(
      caughtTap(22, '23514', message),
      [22]
    );
    assert.equal(value.diagnosticValid, true);
    assert.equal(value.messageCategory, category);
    assert.equal(
      value.expectedMessageMatches,
      category === 'expected_intent_missing'
    );
  }
});
test('signup fixed message category redacts arbitrary runtime values', () => {
  const [value] = signupCaughtDiagnostics(
    caughtTap(23, '23514', 'PRIVATE password=SECRET'),
    [23]
  );
  assert.equal(value.messageCategory, 'other_redacted');
  assert.equal(value.expectedMessageMatches, false);
  for (const text of ['PRIVATE', 'SECRET', 'password', 'caught:', 'wanted:']) {
    assert.equal(JSON.stringify(value).includes(text), false);
  }
});
test('signup fixed message category never normalizes ambiguous spellings', () => {
  for (const message of [
    ' Employee onboarding registry is missing',
    'Employee onboarding registry is missing ',
    'employee onboarding registry is missing',
    'Employee onboarding registry is missing PRIVATE',
  ]) {
    const [value] = signupCaughtDiagnostics(
      caughtTap(22, '23514', message),
      [22]
    );
    assert.equal(value.messageCategory, 'other_redacted');
  }
});
test('signup fixed message category stays null for multiline diagnostics', () => {
  const tap = caughtTap(
    22,
    '23514',
    'Employee onboarding registry is missing'
  ).replace('#       wanted:', '# PRIVATE continuation\n#       wanted:');
  const [value] = signupCaughtDiagnostics(tap, [22]);
  assert.equal(value.diagnosticValid, false);
  assert.equal(value.messageCategory, null);
  assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
});
test('signup fixed message category stays null for malformed or duplicate evidence', () => {
  const valid = caughtTap(
    22,
    '23514',
    'Employee onboarding registry is missing'
  );
  for (const tap of [
    valid.replace('Failed test 22:', 'Failed test 23:'),
    `${valid}# caught: 23514: PRIVATE\n`,
    valid.replace('caught: 23514:', 'caught: private:'),
    valid.replace('wanted: 23514:', 'wanted: 42501:'),
  ]) {
    const [value] = signupCaughtDiagnostics(tap, [22]);
    assert.equal(value.diagnosticValid, false);
    assert.equal(value.messageCategory, null);
  }
});
test('signup fixed message category preserves scope and schema success gates', () => {
  const diagnostic = schemaFailureDiagnostic('packet-tap', 2, {
    stdout: caughtTap(22, '23514', 'Employee onboarding registry is missing'),
  });
  assert.deepEqual(diagnostic.signupExceptions, []);
  assert.equal(receipt().schemaQualified, true);
  assert.equal(receipt().assertions, 172);
  assert.equal(receipt({ cleanupSucceeded: false }).schemaQualified, false);
});

test('signup CHECK diagnostics classify only frozen relation and constraint pairs', () => {
  const contracts = [
    [
      'employee_creation_intents',
      'employee_creation_intents_staff_email_check',
      'intent_staff_email_check',
    ],
    [
      'employee_creation_intents',
      'employee_creation_intents_managed_name_check',
      'intent_managed_name_check',
    ],
    [
      'infrastructure_employees',
      'infrastructure_employees_staff_email_check',
      'employee_staff_email_check',
    ],
    [
      'infrastructure_employees',
      'infrastructure_employees_managed_name_check',
      'employee_managed_name_check',
    ],
    [
      'infrastructure_employees',
      'infrastructure_employees_lifecycle_state_check',
      'employee_lifecycle_check',
    ],
    [
      'infrastructure_employees',
      'infrastructure_employees_check',
      'employee_recovery_check',
    ],
  ];
  for (const [relation, constraint, category] of contracts) {
    const message = `new row for relation "${relation}" violates check constraint "${constraint}"`;
    for (const ordinal of [22, 23]) {
      const [value] = signupCaughtDiagnostics(
        caughtTap(ordinal, '23514', message),
        [ordinal]
      );
      assert.equal(value.constraintCategory, category);
      assert.equal(value.messageCategory, 'other_redacted');
      assert.equal(value.expectedMessageMatches, false);
      assert.equal(JSON.stringify(value).includes(message), false);
      assert.equal(
        signupCaughtDiagnostics(caughtTap(ordinal, '42501', message), [
          ordinal,
        ])[0].constraintCategory,
        'other_redacted'
      );
    }
  }
});
test('signup CHECK diagnostics reject unknown pairs and message normalization', () => {
  const message =
    'new row for relation "infrastructure_employees" violates check constraint "infrastructure_employees_staff_email_check"';
  for (const bad of [
    `${message} PRIVATE`,
    ` ${message}`,
    message.toUpperCase(),
    message.replace('infrastructure_employees"', 'employee_creation_intents"'),
    message.replace('staff_email_check', 'PRIVATE_check'),
    'password=PRIVATE token=SECRET',
  ]) {
    const [value] = signupCaughtDiagnostics(caughtTap(22, '23514', bad), [22]);
    assert.equal(value.constraintCategory, 'other_redacted');
    assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
    assert.equal(JSON.stringify(value).includes('SECRET'), false);
  }
});
test('invalid signup caught evidence keeps constraint classification null', () => {
  const tap = caughtTap(22, '23514', 'PRIVATE').replace(
    'Failed test 22:',
    'Failed test 23:'
  );
  assert.equal(signupCaughtDiagnostics(tap, [22])[0].constraintCategory, null);
});

test('personal journal profile requires its exact rollback packet and cleanup', () => {
  const packets = personalJournalPackets.map(([file, assertions]) => ({
    file,
    assertions,
  }));
  const options = {
    sourceSha: 'a'.repeat(40),
    packets,
    lifecycleCode: 0,
    cleanupSucceeded: true,
    personalJournal: true,
  };
  assert.deepEqual(selectSchemaPackets(false, true).at(-1), [
    'personal-journal.sql',
    24,
  ]);
  assert.equal(schemaReceipt(options).scope, 'personal-journal');
  assert.equal(schemaReceipt(options).schemaQualified, true);
  assert.equal(schemaReceipt(options).assertions, 196);
  assert.equal(
    schemaReceipt({ ...options, packets: packets.slice(0, -1) })
      .schemaQualified,
    false
  );
  assert.equal(
    schemaReceipt({
      ...options,
      packets: [
        ...packets.slice(0, -1),
        { file: 'personal-journal.sql', assertions: 23 },
      ],
    }).schemaQualified,
    false
  );
  assert.equal(
    schemaReceipt({ ...options, cleanupSucceeded: false }).schemaQualified,
    false
  );
  assert.equal(
    schemaReceipt({ ...options, lifecycleCode: 1 }).schemaQualified,
    false
  );
  assert.throws(() => selectSchemaPackets(true, true));
  assert.throws(() => selectSchemaPackets(false, true, true));
  assert.throws(() => selectSchemaPackets(false, 'true'));
  assert.equal(
    schemaFailureDiagnostic(
      'packet-tap',
      6,
      { stdout: 'not ok 24 - redacted' },
      false,
      true
    ).failedAssertionOrdinals[0],
    24
  );
  assert.throws(() =>
    schemaFailureDiagnostic('packet-tap', 7, {}, false, true)
  );
});

test('migration packet is opt-in and strict in both incompatible profiles', () => {
  for (const journal of [false, true]) {
    const base = selectSchemaPackets(journal);
    const selected = selectSchemaPackets(journal, false, true);
    const all = selected.map(([file, assertions]) => ({ file, assertions }));
    assert.deepEqual(selected.slice(0, -2), base);
    assert.deepEqual(selected.at(-2), [
      'employee-google-destination-migration.sql',
      30,
    ]);
    assert.deepEqual(selected.at(-1), ['employee-address-migration.sql', 10]);
    for (const [, count] of selected) assertPacketTap(tap(count), count);
    const expected = journal ? 364 : 212;
    const complete = receipt({ journal, addressMigration: true, packets: all });
    assert.equal(complete.schemaQualified, true);
    assert.equal(complete.assertions, expected);
    assert.match(complete.scope, /-address-migration$/u);
    assert.equal(receipt({ journal, packets: all }).schemaQualified, false);
    assert.equal(
      receipt({ journal, addressMigration: true }).schemaQualified,
      false
    );
    assert.equal(
      receipt({ journal: !journal, addressMigration: true, packets: all })
        .schemaQualified,
      false
    );
    for (const bad of [
      all.slice(0, -1),
      [...all, all.at(-1)],
      [...all].reverse(),
      [
        ...all.slice(0, -1),
        { file: 'employee-address-migration.sql', assertions: 9 },
      ],
    ]) {
      assert.equal(
        receipt({ journal, addressMigration: true, packets: bad })
          .schemaQualified,
        false
      );
    }
    assert.equal(
      receipt({
        journal,
        addressMigration: true,
        packets: all,
        cleanupSucceeded: false,
      }).schemaQualified,
      false
    );
    assert.equal(
      receipt({
        journal,
        addressMigration: true,
        packets: all,
        lifecycleCode: 1,
      }).schemaQualified,
      false
    );
    const diagnostic = schemaFailureDiagnostic(
      'packet-tap',
      selected.length,
      { status: 1, stdout: 'not ok 10 - private' },
      journal,
      false,
      true
    );
    assert.deepEqual(diagnostic.failedAssertionOrdinals, [10]);
  }
});

test('migration selector rejects malformed inputs and leaves defaults unchanged', () => {
  for (const value of [undefined, 'false'])
    assert.equal(selectAddressMigration(value), false);
  assert.equal(selectAddressMigration('true'), true);
  for (const value of [true, false, '', 'TRUE', '1'])
    assert.throws(() => selectAddressMigration(value));
  assert.throws(() => selectSchemaPackets(false, false, 'true'));
});
