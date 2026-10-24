const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  addUiImport,
  codemod,
  rewriteUses,
  shadcnPrefixes,
} = require('./mobile-shadcn-codemod.js');

const SHAD = "import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;";

test('rewrites Gap, Theme and Lucide icons for the import prefix', () => {
  const source = `${SHAD}
final a = const shad.Gap(8);
final b = shad.Theme.of(context).colorScheme.primary;
final c = shad.LucideIcons.earth;
final d = shad.LucideIcons.github;
final e = shad.OutlineButton(onPressed: null, child: x);
`;
  assert.deepEqual(shadcnPrefixes(source), ['shad']);
  const next = rewriteUses(source, ['shad']);
  assert.match(next, /const AppGap\(8\)/u);
  assert.match(next, /AppTokens\.of\(context\)\.colorScheme\.primary/u);
  assert.match(next, /= LucideIcons\.earth/u);
  assert.match(next, /= AppIcons\.github/u);
  assert.match(next, /shad\.OutlineButton/u);
});

test('inserts the ui import in sorted position', () => {
  const source = [
    "import 'package:flutter/material.dart';",
    "import 'package:mobile/core/layout/layout.dart';",
    "import 'package:mobile/l10n/l10n.dart';",
    '',
  ].join('\n');
  assert.equal(
    addUiImport(source),
    [
      "import 'package:flutter/material.dart';",
      "import 'package:mobile/core/layout/layout.dart';",
      "import 'package:mobile/core/ui/ui.dart';",
      "import 'package:mobile/l10n/l10n.dart';",
      '',
    ].join('\n')
  );
});

test('drops the shadcn import only when the library and parts are clean', () => {
  const lib = path.resolve('/x/lib/a.dart');
  const part = path.resolve('/x/lib/a_part.dart');
  const files = {
    [lib]: `${SHAD}\npart 'a_part.dart';\nfinal g = shad.Gap(4);\n`,
    [part]: "part of 'a.dart';\nfinal i = shad.LucideIcons.x;\n",
  };
  const changes = codemod([part], (file) => files[file]);
  assert.doesNotMatch(changes.get(lib), /shadcn_flutter/u);
  assert.match(changes.get(lib), /core\/ui\/ui\.dart/u);
  assert.match(changes.get(part), /LucideIcons\.x/u);

  files[part] = "part of 'a.dart';\nfinal b = shad.Card(child: x);\n";
  const partial = codemod([lib], (file) => files[file]);
  assert.match(partial.get(lib), /shadcn_flutter/u);
  assert.match(partial.get(lib), /AppGap\(4\)/u);
});
