const assert = require('node:assert/strict');
const test = require('node:test');

const { UNDECODABLE_URI, directiveUris } = require('./dart-directive-uris.js');

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

test('Dart escapes in URIs are decoded', () => {
  // s = s, \x5f = _, \u{66} = f, \/ = /.
  for (const literal of [
    "'package:\\u0073hadcn_flutter/shadcn_flutter.dart'",
    "'package:shadcn\\x5fflutter/shadcn_flutter.dart'",
    "'package:shadcn_\\u{66}lutter/shadcn_flutter.dart'",
    "'package:shadcn_flutter\\/shadcn_flutter.dart'",
    '"package:shadcn_flutter/\\u{0073}hadcn_flutter.dart"',
  ]) {
    assert.deepEqual(directiveUris(`import ${literal};`), [SHAD], literal);
  }
  // Raw strings keep backslashes verbatim.
  assert.deepEqual(directiveUris("import r'a\\u0073.dart';"), [
    'a\\u0073.dart',
  ]);
});

test('malformed escapes and interpolation fail closed', () => {
  for (const literal of [
    "'package:shadcn_flutter/\\x5.dart'",
    "'package:\\u{110000}x.dart'",
    "'package:\\u{}x.dart'",
    "'package:\\u12x.dart'",
    // Dart interpolation; split so it is not read as a JS template.
    "'package:$" + "{'shadcn'}_flutter/x.dart'",
  ]) {
    assert.deepEqual(
      directiveUris(`import ${literal};`),
      [UNDECODABLE_URI],
      literal
    );
  }
  // One undecodable part taints the joined adjacent literal.
  assert.deepEqual(directiveUris("import 'package:' '\\x' 'x.dart';"), [
    UNDECODABLE_URI,
  ]);
});

test("triple-quoted URIs follow Dart's leading-newline rule", () => {
  for (const literal of [
    `'''\n${SHAD}'''`,
    `"""  \n${SHAD}"""`,
    `r'''\n${SHAD}'''`,
    `r"""\t\r\n${SHAD}"""`,
  ]) {
    assert.deepEqual(directiveUris(`import ${literal};`), [SHAD], literal);
  }
});

test('a URI that still spans lines fails closed', () => {
  assert.deepEqual(
    directiveUris(`import '''package:shadcn_flutter/\nshadcn_flutter.dart''';`),
    [UNDECODABLE_URI]
  );
  assert.deepEqual(directiveUris(`import '''x\n${SHAD}''';`), [
    UNDECODABLE_URI,
  ]);
});
