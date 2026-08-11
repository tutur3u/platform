const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  REQUIRED_FIELDS,
  STRICT_EXIT_CODE,
  auditCoordinationNotes,
  parseArgs,
  parseCoordinationNote,
  runCli,
} = require('./coordination-notes.js');

function makeTempRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coordination-notes-'));
  fs.mkdirSync(path.join(rootDir, 'tmp', 'agent-coordination'), {
    recursive: true,
  });
  return rootDir;
}

function cleanupTempRoot(rootDir) {
  fs.rmSync(rootDir, { recursive: true, force: true });
}

function noteText({ format = 'plain', status = 'working', secret = '' } = {}) {
  const values = {
    Agent: 'Codex',
    Intent: 'Audit coordination notes',
    'Owned paths': '',
    'Observed dirty paths': 'None',
    Status: status,
    Needs: 'None',
    Verification: 'Focused tests pass',
    Risks: secret || 'None',
    'Commit window': 'not needed',
  };
  const field = (name) =>
    format === 'bold'
      ? `- **${name}:** ${values[name]}`
      : `${name}: ${values[name]}`;

  return [
    field('Agent'),
    field('Intent'),
    field('Owned paths'),
    '- scripts/coordination-notes.js',
    field('Observed dirty paths'),
    field('Status'),
    field('Needs'),
    field('Verification'),
    field('Risks'),
    field('Commit window'),
  ].join('\n');
}

function writeNote(rootDir, name, text) {
  fs.writeFileSync(
    path.join(rootDir, 'tmp', 'agent-coordination', name),
    `${text}\n`
  );
}

function captureCli(argv, options = {}) {
  let stdout = '';
  let stderr = '';
  const exitCode = runCli(argv, {
    ...options,
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  return { exitCode, stdout, stderr };
}

test('parser accepts plain and bulleted-bold field formats', () => {
  for (const format of ['plain', 'bold']) {
    const parsed = parseCoordinationNote(
      noteText({ format }),
      'tmp/agent-coordination/active.md'
    );
    assert.deepEqual(parsed.diagnostics, []);
  }
});

test('parser accepts mixed field order and every canonical status', () => {
  for (const status of ['working', 'blocked', 'handoff']) {
    const lines = noteText({ status }).split('\n');
    const reordered = [lines[4], ...lines.slice(0, 4), ...lines.slice(5)];
    assert.deepEqual(
      parseCoordinationNote(
        reordered.join('\n'),
        'tmp/agent-coordination/mixed.md'
      ).diagnostics,
      []
    );
  }

  assert.deepEqual(
    parseCoordinationNote(
      noteText({ status: 'done' }),
      'tmp/agent-coordination/archive/2026/done.md'
    ).diagnostics,
    []
  );
});

test('parser reports missing, duplicate, and malformed owned-path fields', () => {
  const missing = parseCoordinationNote(
    'Agent: Codex\nStatus: working\nOwned paths:\nnot a list',
    'tmp/agent-coordination/incomplete.md'
  );
  assert.ok(
    missing.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'malformed_owned_paths' &&
        diagnostic.field === 'Owned paths'
    )
  );
  assert.ok(
    missing.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'missing_field' && diagnostic.field === 'Intent'
    )
  );

  const duplicate = parseCoordinationNote(
    `${noteText()}\nAgent: Another agent`,
    'tmp/agent-coordination/duplicate.md'
  );
  assert.ok(
    duplicate.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'duplicate_field' && diagnostic.field === 'Agent'
    )
  );
});

test('parser rejects known status synonyms without exposing their values', () => {
  for (const status of ['complete', 'partial', 'in progress']) {
    const parsed = parseCoordinationNote(
      noteText({ status }),
      'tmp/agent-coordination/synonym.md'
    );
    const diagnostic = parsed.diagnostics.find(
      (entry) => entry.code === 'noncanonical_status'
    );
    assert.deepEqual(diagnostic, {
      path: 'tmp/agent-coordination/synonym.md',
      code: 'noncanonical_status',
      field: 'Status',
    });
    assert.doesNotMatch(JSON.stringify(parsed), new RegExp(status));
  }
});

test('parser ignores inline field mentions and reports standalone Status missing', () => {
  const parsed = parseCoordinationNote(
    noteText().replace('Status: working', 'Progress says Status: working'),
    'tmp/agent-coordination/inline.md'
  );
  assert.ok(
    parsed.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'missing_field' && diagnostic.field === 'Status'
    )
  );
});

test('parser flags top-level done but accepts archived done', () => {
  const topLevel = parseCoordinationNote(
    noteText({ status: 'done' }),
    'tmp/agent-coordination/done.md'
  );
  assert.ok(
    topLevel.diagnostics.some(
      (diagnostic) => diagnostic.code === 'done_at_top_level'
    )
  );

  const archived = parseCoordinationNote(
    noteText({ status: 'done' }),
    'tmp/agent-coordination/archive/2026/done.md'
  );
  assert.deepEqual(archived.diagnostics, []);
});

test('parseArgs supports JSON and strict modes', () => {
  assert.deepEqual(parseArgs(['audit']), { json: false, strict: false });
  assert.deepEqual(parseArgs(['audit', '--json', '--strict']), {
    json: true,
    strict: true,
  });
  assert.throws(() => parseArgs(['audit', '--write']), /Unknown option/u);
});

test('audit scans only sorted top-level Markdown files', () => {
  const rootDir = makeTempRoot();
  try {
    writeNote(rootDir, 'b.md', noteText({ status: 'complete' }));
    writeNote(rootDir, 'a.md', noteText());
    fs.writeFileSync(
      path.join(rootDir, 'tmp', 'agent-coordination', 'lock.json'),
      '{}'
    );
    fs.mkdirSync(
      path.join(rootDir, 'tmp', 'agent-coordination', 'archive', '2026'),
      { recursive: true }
    );
    fs.writeFileSync(
      path.join(
        rootDir,
        'tmp',
        'agent-coordination',
        'archive',
        '2026',
        'ignored.md'
      ),
      noteText({ status: 'done' })
    );

    const report = auditCoordinationNotes({ rootDir });
    assert.deepEqual(
      report.files.map((file) => file.path),
      ['tmp/agent-coordination/a.md', 'tmp/agent-coordination/b.md']
    );
    assert.equal(report.scannedFiles, 2);
    assert.equal(report.filesWithDiagnostics, 1);
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('CLI default succeeds with debt and prints deterministic safe diagnostics', () => {
  const rootDir = makeTempRoot();
  const sensitiveValue = 'credential-do-not-print';
  try {
    writeNote(
      rootDir,
      'unsafe.md',
      noteText({ status: 'partial', secret: sensitiveValue })
    );
    const result = captureCli(['audit'], { rootDir });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /unsafe\.md: noncanonical_status \(Status\)/u);
    assert.doesNotMatch(result.stdout, new RegExp(sensitiveValue));
    assert.equal(result.stderr, '');
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('CLI human report emits one deterministic diagnostic line per file', () => {
  const rootDir = makeTempRoot();
  try {
    writeNote(rootDir, 'z.md', 'Status: partial');
    writeNote(rootDir, 'a.md', noteText({ status: 'done' }));
    const result = captureCli(['audit'], { rootDir });
    const diagnosticLines = result.stdout
      .split('\n')
      .filter((line) => line.startsWith('tmp/agent-coordination/'));

    assert.equal(diagnosticLines.length, 2);
    assert.match(diagnosticLines[0], /a\.md: done_at_top_level \(Status\)$/u);
    assert.match(diagnosticLines[1], /^tmp\/agent-coordination\/z\.md:/u);
    assert.match(diagnosticLines[1], /missing_field \(Agent\)/u);
    assert.match(diagnosticLines[1], /noncanonical_status \(Status\)/u);
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('CLI strict mode fails when diagnostics exist', () => {
  const rootDir = makeTempRoot();
  try {
    writeNote(rootDir, 'done.md', noteText({ status: 'done' }));
    assert.equal(
      captureCli(['audit', '--strict'], { rootDir }).exitCode,
      STRICT_EXIT_CODE
    );
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('CLI JSON mode emits a stable machine-readable report', () => {
  const rootDir = makeTempRoot();
  try {
    writeNote(rootDir, 'valid.md', noteText());
    const result = captureCli(['audit', '--json'], { rootDir });
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
      version: 1,
      scannedFiles: 1,
      filesWithDiagnostics: 0,
      diagnosticCount: 0,
      byCode: {
        read_error: 0,
        missing_field: 0,
        duplicate_field: 0,
        noncanonical_status: 0,
        malformed_owned_paths: 0,
        done_at_top_level: 0,
      },
      files: [
        {
          path: 'tmp/agent-coordination/valid.md',
          diagnostics: [],
        },
      ],
    });
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('CLI handles an empty or missing coordination directory', () => {
  const rootDir = makeTempRoot();
  try {
    const empty = captureCli(['audit'], { rootDir });
    assert.equal(empty.exitCode, 0);
    assert.match(empty.stdout, /0 file\(s\)/u);
    assert.match(empty.stdout, /No lifecycle diagnostics found/u);
  } finally {
    cleanupTempRoot(rootDir);
  }

  const missingRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'coordination-notes-missing-')
  );
  try {
    assert.equal(captureCli(['audit'], { rootDir: missingRoot }).exitCode, 0);
  } finally {
    cleanupTempRoot(missingRoot);
  }
});

test('CLI reports inaccessible files without echoing file contents', () => {
  const secret = 'private-body-value';
  const fsImpl = {
    readdirSync: () => [{ name: 'unreadable.md', isFile: () => true }],
    readFileSync: () => {
      const error = new Error(secret);
      error.code = 'EACCES';
      throw error;
    },
  };
  const result = captureCli(['audit', '--strict'], {
    rootDir: '/fixture',
    fsImpl,
  });
  assert.equal(result.exitCode, STRICT_EXIT_CODE);
  assert.match(result.stdout, /unreadable\.md: read_error/u);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
});

test('all required root-policy fields are represented', () => {
  assert.deepEqual(REQUIRED_FIELDS, [
    'Agent',
    'Intent',
    'Owned paths',
    'Observed dirty paths',
    'Status',
    'Needs',
    'Verification',
    'Risks',
    'Commit window',
  ]);
});
