const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  countPhysicalLines,
  discoverChangedFiles,
  evaluateChangedFiles,
  formatViolations,
  isAuthoredSourcePath,
  mergeChanges,
  normalizePath,
  parseNameStatusZ,
  resolveComparisonBase,
  runSourceSizeCheck,
} = require('./check-source-size.js');

function createTempDir(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'source-size-'));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  return directory;
}

function contentWithLines(lines, options = {}) {
  if (lines === 0) {
    return '';
  }
  const body = `${'line\n'.repeat(lines - 1)}line`;
  return options.trailingNewline === false ? body : `${body}\n`;
}

function writeFile(rootDir, filePath, content) {
  const absolutePath = path.join(rootDir, filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function createGitStub(responses, calls = []) {
  return (command, args) => {
    assert.equal(command, 'git');
    calls.push(args);
    const key = args.join(' ');
    const response = responses.get(key);
    if (response instanceof Error || response === undefined) {
      throw response ?? new Error(`Unexpected Git command: ${key}`);
    }
    return response;
  };
}

test('normalizes paths and recognizes every authored extension', () => {
  assert.equal(
    normalizePath('.\\apps\\web//src/file.ts'),
    'apps/web/src/file.ts'
  );

  for (const extension of [
    'ts',
    'tsx',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'rs',
    'dart',
    'py',
    'sql',
    'sh',
  ]) {
    assert.equal(isAuthoredSourcePath(`src/example.${extension}`), true);
  }

  assert.equal(isAuthoredSourcePath('src/readme.md'), false);
  assert.equal(isAuthoredSourcePath('src/image.png'), false);
});

test('excludes only the specified generated and vendor paths', () => {
  for (const filePath of [
    'node_modules/pkg/index.js',
    'apps/web/.next/server.js',
    'apps/backend/target/generated.rs',
    'packages/tool/dist/index.js',
    'coverage/report.js',
    '.worktrees/example/source.ts',
    'packages/types/src/supabase.ts',
    'apps/tanstack-web/src/routeTree.gen.ts',
    'apps/mobile/model.g.dart',
    'apps/mobile/model.freezed.dart',
    'apps/mobile/model.gen.dart',
  ]) {
    assert.equal(isAuthoredSourcePath(filePath), false, filePath);
  }

  assert.equal(isAuthoredSourcePath('apps/database/migrations/001.sql'), true);
  assert.equal(isAuthoredSourcePath('scripts/example.test.js'), true);
  assert.equal(isAuthoredSourcePath('fixtures/authored-example.ts'), true);
  assert.equal(isAuthoredSourcePath('src/distinct/file.ts'), true);
});

test('counts physical lines for LF, CRLF, and missing trailing newline', () => {
  assert.equal(countPhysicalLines(''), 0);
  assert.equal(countPhysicalLines('one'), 1);
  assert.equal(countPhysicalLines('one\n'), 1);
  assert.equal(countPhysicalLines('one\ntwo'), 2);
  assert.equal(countPhysicalLines('one\r\ntwo\r\n'), 2);
});

test('parses modified, deleted, renamed, and bracketed paths without quoting loss', () => {
  const changes = parseNameStatusZ(
    [
      'M',
      'src/space name.ts',
      'D',
      'src/deleted.ts',
      'R100',
      'src/[old].ts',
      'src/[new].ts',
      '',
    ].join('\0'),
    'committed'
  );

  assert.deepEqual(changes, [
    {
      basePath: 'src/space name.ts',
      currentPath: 'src/space name.ts',
      deleted: false,
      source: 'committed',
      status: 'M',
    },
    {
      basePath: 'src/deleted.ts',
      currentPath: 'src/deleted.ts',
      deleted: true,
      source: 'committed',
      status: 'D',
    },
    {
      basePath: 'src/[old].ts',
      currentPath: 'src/[new].ts',
      deleted: false,
      source: 'committed',
      status: 'R',
    },
  ]);
});

test('merges committed, staged, unstaged, and untracked changes deterministically', () => {
  const calls = [];
  const execFile = createGitStub(
    new Map([
      [
        'diff --name-status -z --find-renames base HEAD --',
        'M\0src/shared.ts\0D\0src/deleted.ts\0',
      ],
      [
        'diff --cached --name-status -z --find-renames --',
        'R100\0src/old name.ts\0src/[renamed].ts\0',
      ],
      ['diff --name-status -z --find-renames --', 'M\0src/shared.ts\0'],
      [
        'ls-files --others --exclude-standard -z --',
        'src/untracked file.ts\0src/shared.ts\0',
      ],
    ]),
    calls
  );

  const changes = discoverChangedFiles('base', {
    execFile,
    rootDir: '/repo',
  });

  assert.deepEqual(
    changes.map(({ basePath, currentPath, deleted, sources }) => ({
      basePath,
      currentPath,
      deleted,
      sources,
    })),
    [
      {
        basePath: 'src/old name.ts',
        currentPath: 'src/[renamed].ts',
        deleted: false,
        sources: ['staged'],
      },
      {
        basePath: 'src/deleted.ts',
        currentPath: 'src/deleted.ts',
        deleted: true,
        sources: ['committed'],
      },
      {
        basePath: 'src/shared.ts',
        currentPath: 'src/shared.ts',
        deleted: false,
        sources: ['committed', 'unstaged', 'untracked'],
      },
      {
        basePath: 'src/untracked file.ts',
        currentPath: 'src/untracked file.ts',
        deleted: false,
        sources: ['untracked'],
      },
    ]
  );
  assert.equal(calls.length, 4);
});

test('preserves a rename base path when later changes touch the renamed file', () => {
  const changes = mergeChanges([
    [
      {
        basePath: 'src/old.ts',
        currentPath: 'src/new.ts',
        deleted: false,
        source: 'staged',
        status: 'R',
      },
    ],
    [
      {
        basePath: 'src/new.ts',
        currentPath: 'src/new.ts',
        deleted: false,
        source: 'unstaged',
        status: 'M',
      },
    ],
  ]);

  assert.equal(changes[0].basePath, 'src/old.ts');
});

test('resolves an explicit CLI base before every environment base', () => {
  const calls = [];
  const execFile = createGitStub(
    new Map([['rev-parse --verify cli^{commit}', 'cli-sha\n']]),
    calls
  );

  assert.equal(
    resolveComparisonBase({
      argv: ['--base', 'cli'],
      env: { GITHUB_BASE_REF: 'develop', SOURCE_SIZE_BASE_SHA: 'env' },
      execFile,
      rootDir: '/repo',
    }),
    'cli-sha'
  );
  assert.equal(calls.length, 1);
});

test('resolves SOURCE_SIZE_BASE_SHA when no CLI base is present', () => {
  const execFile = createGitStub(
    new Map([['rev-parse --verify env^{commit}', 'env-sha\n']])
  );
  assert.equal(
    resolveComparisonBase({
      argv: [],
      env: { GITHUB_BASE_REF: 'develop', SOURCE_SIZE_BASE_SHA: 'env' },
      execFile,
      rootDir: '/repo',
    }),
    'env-sha'
  );
});

test('resolves the GitHub base ref through merge-base', () => {
  const execFile = createGitStub(
    new Map([['merge-base HEAD origin/develop', 'github-base\n']])
  );
  assert.equal(
    resolveComparisonBase({
      argv: [],
      env: { GITHUB_BASE_REF: 'develop' },
      execFile,
      rootDir: '/repo',
    }),
    'github-base'
  );
});

test('uses origin/main only when its merge-base differs from HEAD', () => {
  const execFile = createGitStub(
    new Map([
      ['rev-parse --verify HEAD', 'head-sha\n'],
      ['merge-base HEAD origin/main', 'main-base\n'],
    ])
  );
  assert.equal(
    resolveComparisonBase({ argv: [], env: {}, execFile, rootDir: '/repo' }),
    'main-base'
  );
});

test('falls back to the first parent when origin/main is HEAD', () => {
  const execFile = createGitStub(
    new Map([
      ['rev-parse --verify HEAD', 'head-sha\n'],
      ['merge-base HEAD origin/main', 'head-sha\n'],
      ['rev-parse --verify HEAD^{commit}^', 'parent-sha\n'],
    ])
  );
  assert.equal(
    resolveComparisonBase({ argv: [], env: {}, execFile, rootDir: '/repo' }),
    'parent-sha'
  );
});

test('returns no base when neither origin/main nor a parent resolves', () => {
  const execFile = () => {
    throw new Error('missing');
  };
  assert.equal(
    resolveComparisonBase({ argv: [], env: {}, execFile, rootDir: '/repo' }),
    null
  );
});

test('enforces new-file and grandfathered boundaries at 699, 700, and 701', (t) => {
  const rootDir = createTempDir(t);
  const files = {
    'src/crossed.ts': 701,
    'src/grew.ts': 802,
    'src/new-699.ts': 699,
    'src/new-700.ts': 700,
    'src/new-701.ts': 701,
    'src/shrank.ts': 750,
    'src/unchanged.ts': 800,
  };
  for (const [filePath, lines] of Object.entries(files)) {
    writeFile(rootDir, filePath, contentWithLines(lines));
  }
  const baseFiles = new Map([
    ['src/crossed.ts', contentWithLines(700)],
    ['src/grew.ts', contentWithLines(801)],
    ['src/shrank.ts', contentWithLines(900)],
    ['src/unchanged.ts', contentWithLines(800)],
  ]);
  const changes = Object.keys(files).map((filePath) => ({
    basePath: filePath,
    currentPath: filePath,
    deleted: false,
  }));
  const result = evaluateChangedFiles(changes, 'base', {
    readBase: (filePath) => baseFiles.get(filePath) ?? null,
    rootDir,
  });

  assert.deepEqual(result.violations, [
    {
      baseLines: 700,
      currentLines: 701,
      path: 'src/crossed.ts',
      reason: 'crossed',
    },
    {
      baseLines: 801,
      currentLines: 802,
      path: 'src/grew.ts',
      reason: 'grew',
    },
    {
      baseLines: null,
      currentLines: 701,
      path: 'src/new-701.ts',
      reason: 'new',
    },
  ]);
  assert.equal(result.checked, 7);
});

test('skips deletions, non-source files, and binary source files', (t) => {
  const rootDir = createTempDir(t);
  writeFile(rootDir, 'src/binary.ts', Buffer.from([1, 0, 2]));
  writeFile(rootDir, 'src/readme.md', contentWithLines(900));
  const result = evaluateChangedFiles(
    [
      {
        basePath: 'src/binary.ts',
        currentPath: 'src/binary.ts',
        deleted: false,
      },
      {
        basePath: 'src/readme.md',
        currentPath: 'src/readme.md',
        deleted: false,
      },
      {
        basePath: 'src/deleted.ts',
        currentPath: 'src/deleted.ts',
        deleted: true,
      },
    ],
    'base',
    { readBase: () => null, rootDir }
  );

  assert.deepEqual(result, { checked: 0, violations: [] });
});

test('formats multiple violations in stable path order', () => {
  const output = formatViolations([
    {
      baseLines: 700,
      currentLines: 701,
      path: 'a.ts',
      reason: 'crossed',
    },
    {
      baseLines: null,
      currentLines: 702,
      path: 'b.ts',
      reason: 'new',
    },
  ]);
  assert.match(output, /a\.ts: 701 lines \(base: 700; crossed\)/u);
  assert.match(output, /b\.ts: 702 lines \(new file\)/u);
  assert.ok(output.indexOf('a.ts') < output.indexOf('b.ts'));
});

test('an isolated Git fixture rejects an untracked 701-line bracketed path', (t) => {
  const rootDir = createTempDir(t);
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'source-size@example.test'], {
    cwd: rootDir,
  });
  execFileSync('git', ['config', 'user.name', 'Source Size Test'], {
    cwd: rootDir,
  });
  writeFile(rootDir, 'README.md', 'fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: rootDir });
  const base = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  const oversizedPath = 'src/[oversized file].ts';
  writeFile(rootDir, oversizedPath, contentWithLines(701));
  let stdout = '';
  let stderr = '';
  const exitCode = runSourceSizeCheck({
    argv: ['--base', base],
    env: {},
    rootDir,
    stderr: { write: (value) => (stderr += value) },
    stdout: { write: (value) => (stdout += value) },
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout, '');
  assert.match(stderr, /src\/\[oversized file\]\.ts: 701 lines/u);
});

test('fails closed with an actionable message when no base resolves', () => {
  let stderr = '';
  const exitCode = runSourceSizeCheck({
    argv: [],
    env: {},
    execFile: () => {
      throw new Error('missing');
    },
    rootDir: '/repo',
    stderr: { write: (value) => (stderr += value) },
    stdout: { write: () => {} },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr, /pass --base <sha> or SOURCE_SIZE_BASE_SHA/u);
});
