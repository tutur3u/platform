const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { execFileSync } = require('node:child_process');

const {
  collectShadcnImporters,
  formatAllowlist,
  importsShadcn,
  main,
  parseAllowlist,
  readBaseAllowlist,
  validate,
} = require('./check-mobile-shadcn-imports.js');

test('detects direct and shim imports only in directives', () => {
  assert.ok(
    importsShadcn(
      "import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;"
    )
  );
  assert.ok(
    importsShadcn(
      "import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as shad;"
    )
  );
  assert.ok(
    importsShadcn("export 'package:shadcn_flutter/shadcn_flutter.dart';")
  );
  assert.equal(
    importsShadcn("// import 'package:shadcn_flutter/shadcn_flutter.dart';"),
    false
  );
  assert.equal(
    importsShadcn("import 'package:mobile/core/ui/ui.dart';"),
    false
  );
});

test('collects importers under lib and test, skipping generated l10n', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shadcn-ratchet-'));
  const write = (relative, body) => {
    const file = path.join(root, 'apps/mobile', relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  };
  const shad = "import 'package:shadcn_flutter/shadcn_flutter.dart';\n";
  write('lib/b.dart', shad);
  write('lib/a.dart', "import 'package:flutter/widgets.dart';\n");
  write('lib/l10n/gen/x.dart', shad);
  write('test/a_test.dart', shad);
  assert.deepEqual(collectShadcnImporters({ rootDir: root }), [
    'lib/b.dart',
    'test/a_test.dart',
  ]);
  fs.rmSync(root, { recursive: true, force: true });
});

test('fails new importers and stale entries so the list only shrinks', () => {
  const ok = validate({
    importers: ['lib/a.dart', 'lib/b.dart'],
    allowlist: ['lib/a.dart', 'lib/b.dart'],
    pubspec: '  shadcn_flutter: ^0.0.54\n',
  });
  assert.deepEqual(ok.errors, []);

  const grown = validate({
    importers: ['lib/a.dart', 'lib/new.dart'],
    allowlist: ['lib/a.dart'],
    pubspec: '',
  });
  assert.deepEqual(grown.added, ['lib/new.dart']);
  assert.equal(grown.errors.length, 1);

  const shrunk = validate({
    importers: ['lib/a.dart'],
    allowlist: ['lib/a.dart', 'lib/b.dart'],
    pubspec: '',
  });
  assert.deepEqual(shrunk.stale, ['lib/b.dart']);
  assert.match(shrunk.errors[0], /remove it from the allowlist/u);
});

test('requires sorted unique entries and dependency removal at zero', () => {
  assert.equal(
    validate({
      importers: ['lib/a.dart', 'lib/b.dart'],
      allowlist: ['lib/b.dart', 'lib/a.dart'],
      pubspec: '',
    }).errors[0],
    'Allowlist entries must be sorted.'
  );
  const done = validate({
    importers: [],
    allowlist: [],
    pubspec: 'dependencies:\n  shadcn_flutter: ^0.0.54\n',
  });
  assert.match(done.errors[0], /flutter pub remove shadcn_flutter/u);
});

test('allowlist round-trips through its comment header', () => {
  const entries = ['lib/a.dart', 'test/b_test.dart'];
  assert.deepEqual(parseAllowlist(formatAllowlist(entries)), entries);
});

test('relative shim imports and conditional URIs cannot bypass the check', () => {
  const file = 'lib/features/x/view/page.dart';
  // Reproductions from review: a relative shim path and a conditional import.
  assert.ok(
    importsShadcn(
      "import '../../../core/widgets/shadcn_flutter_compat.dart' as shad;",
      file
    )
  );
  assert.ok(
    importsShadcn(
      [
        "import 'package:flutter/widgets.dart'",
        "    if (dart.library.io) 'package:shadcn_flutter/shadcn_flutter.dart'",
        '    as ui;',
      ].join('\n'),
      file
    )
  );
  assert.ok(
    importsShadcn(
      "export 'stub.dart' if (dart.library.html) '../../../core/theme/mobile_shad_theme.dart';",
      file
    )
  );
  // A relative path that only looks similar does not match.
  assert.equal(
    importsShadcn("import 'widgets/shadcn_flutter_compat.dart';", file),
    false
  );
  assert.equal(
    importsShadcn(
      "/*\nimport 'package:shadcn_flutter/shadcn_flutter.dart';\n*/",
      file
    ),
    false
  );
});

test('allowlist additions relative to the base revision fail', () => {
  const result = validate({
    importers: ['lib/a.dart', 'lib/new.dart'],
    allowlist: ['lib/a.dart', 'lib/new.dart'],
    pubspec: '',
    baseAllowlist: ['lib/a.dart'],
  });
  assert.deepEqual(result.grown, ['lib/new.dart']);
  assert.match(result.errors[0], /may only shrink/u);
  // Removals relative to the base pass.
  assert.deepEqual(
    validate({
      importers: ['lib/a.dart'],
      allowlist: ['lib/a.dart'],
      pubspec: '',
      baseAllowlist: ['lib/a.dart', 'lib/b.dart'],
    }).errors,
    []
  );
});

test('reads the base allowlist from git and fails on a missing revision', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shadcn-base-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'ratchet@example.test');
  git('config', 'user.name', 'Ratchet');
  fs.writeFileSync(path.join(root, 'README'), 'x');
  git('add', '.');
  git('commit', '-qm', 'no allowlist yet');
  // First introduction: no allowlist at the base.
  assert.equal(readBaseAllowlist('HEAD', { rootDir: root }), null);
  const file = path.join(root, 'apps/mobile/tool/shadcn_import_allowlist.txt');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, formatAllowlist(['lib/a.dart']));
  git('add', '.');
  git('commit', '-qm', 'allowlist');
  assert.deepEqual(readBaseAllowlist('HEAD', { rootDir: root }), [
    'lib/a.dart',
  ]);
  assert.throws(() => readBaseAllowlist('deadbeef', { rootDir: root }));
  fs.rmSync(root, { recursive: true, force: true });
});

test('package paths are normalised before matching the shims', () => {
  const file = 'lib/features/x/view/page.dart';
  for (const uri of [
    'package:mobile/core/widgets/./shadcn_flutter_compat.dart',
    'package:mobile/features/../core/widgets/shadcn_flutter_compat.dart',
    'package:mobile/core//theme/mobile_shad_theme.dart',
  ]) {
    assert.ok(importsShadcn(`import '${uri}';`, file), uri);
  }
  assert.ok(
    importsShadcn(
      "import /* x; */ 'package:shadcn_flutter/shadcn_flutter.dart';",
      file
    )
  );
  assert.ok(
    importsShadcn(
      "import 'a.dart'; import 'package:shadcn_flutter/shadcn_flutter.dart';",
      file
    )
  );
});

test('the base check fails closed when no base resolves', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shadcn-closed-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  const write = (relative, body) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  };
  write(
    'apps/mobile/pubspec.yaml',
    'dependencies:\n  shadcn_flutter: ^0.0.54\n'
  );
  write(
    'apps/mobile/lib/a.dart',
    "import 'package:shadcn_flutter/shadcn_flutter.dart';\n"
  );
  write(
    'apps/mobile/tool/shadcn_import_allowlist.txt',
    formatAllowlist(['lib/a.dart'])
  );
  git('init', '-q');
  git('config', 'user.email', 'ratchet@example.test');
  git('config', 'user.name', 'Ratchet');
  git('add', '.');
  git('commit', '-qm', 'base');
  const errors = [];
  const original = console.error;
  console.error = (message) => errors.push(String(message));
  t.after(() => {
    console.error = original;
  });
  // No origin/main and no --base: refuse instead of skipping the check.
  assert.equal(main([], { rootDir: root }), 1);
  assert.match(errors.join('\n'), /cannot determine the base revision/u);
  assert.equal(main(['--base'], { rootDir: root }), 1);
  assert.equal(main(['--base', 'deadbeef'], { rootDir: root }), 1);
  console.error = original;
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal(main(['--base', 'HEAD'], { rootDir: root }), 0);
  } finally {
    console.log = log;
  }
});

test('escaped shadcn and shim URIs are caught', () => {
  const file = 'lib/features/x/view/page.dart';
  assert.ok(
    importsShadcn(
      "import 'package:\\u0073hadcn_flutter/shadcn_flutter.dart' as shad;",
      file
    )
  );
  assert.ok(
    importsShadcn(
      "import 'package:mobile/core/widgets/\\x73hadcn_flutter_compat.dart';",
      file
    )
  );
  assert.ok(
    importsShadcn(
      "import '../../../core/widgets/shadcn\\u{5f}flutter_compat.dart';",
      file
    )
  );
  // Undecodable URIs fail closed.
  assert.ok(importsShadcn("import 'package:\\x7.dart';", file));
  assert.equal(
    importsShadcn("import 'package:mobile/core/ui/\\u0075i.dart';", file),
    false
  );
});

test('multiline shadcn imports are caught', () => {
  const file = 'lib/features/x/view/page.dart';
  assert.ok(
    importsShadcn(
      "import '''\npackage:shadcn_flutter/shadcn_flutter.dart''' as shad;",
      file
    )
  );
  assert.ok(
    importsShadcn(
      "import r'''\n../../../core/widgets/shadcn_flutter_compat.dart''';",
      file
    )
  );
});
