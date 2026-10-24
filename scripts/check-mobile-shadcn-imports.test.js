const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  collectShadcnImporters,
  formatAllowlist,
  importsShadcn,
  parseAllowlist,
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
