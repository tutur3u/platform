const assert = require('node:assert/strict');
const test = require('node:test');

const { directiveUris } = require('./dart-directive-uris.js');

const SHAD = 'package:shadcn_flutter/shadcn_flutter.dart';

test('reads every URI, including conditional alternatives', () => {
  assert.deepEqual(
    directiveUris(
      "import 'a.dart'\n  if (dart.library.io) 'b.dart'\n  if (dart.library.html) \"c.dart\" as x;"
    ),
    ['a.dart', 'b.dart', 'c.dart']
  );
});

test('a comment containing `;` inside a directive cannot hide its URI', () => {
  assert.deepEqual(directiveUris(`import /* x; */ '${SHAD}';`), [SHAD]);
  assert.deepEqual(
    directiveUris(`import // trailing; comment\n  '${SHAD}' as shad;`),
    [SHAD]
  );
});

test('a second directive on the same line is found', () => {
  assert.deepEqual(
    directiveUris(`import 'package:flutter/widgets.dart'; import '${SHAD}';`),
    ['package:flutter/widgets.dart', SHAD]
  );
  assert.deepEqual(directiveUris(`library x; export '${SHAD}' show Gap;`), [
    SHAD,
  ]);
});

test('adjacent literals form one URI', () => {
  assert.deepEqual(
    directiveUris("import 'package:shadcn_' 'flutter/shadcn_flutter.dart';"),
    [SHAD]
  );
});

test('comments, strings and code bodies do not fake directives', () => {
  const source = [
    `// import '${SHAD}';`,
    `/* outer /* nested */ import '${SHAD}'; */`,
    `const s = "import '${SHAD}';";`,
    `const t = '''`,
    `import '${SHAD}';`,
    `''';`,
    `const u = r'\\';`,
    'void f() {',
    `  final v = '\${'}'}';`,
    '}',
    "import 'package:mobile/core/ui/ui.dart';",
  ].join('\n');
  assert.deepEqual(directiveUris(source), ['package:mobile/core/ui/ui.dart']);
});
