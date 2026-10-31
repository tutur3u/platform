const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } =
  require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  check,
  normalizeHost,
  scannedFile,
  stripCommentVariants,
  violations,
} = require('./check-staging-hosts.js');

const stripComments = (source) => stripCommentVariants(source)[0];
for (const host of [
  'pay-staging',
  'contacts.staging',
  'staging',
  'canary',
  'preview',
  'preview.pay',
]) {
  for (const prefix of [
    'rootHosts: ',
    'route = ',
    'URL=https://',
    'allowedHosts: ',
  ]) {
    test(host + prefix, () =>
      assert.equal(violations(`${prefix + host}.tuturuuu.com`).length, 1)
    );
  }
}
test('production and isolated staging allowed', () => {
  assert.deepEqual(
    violations('tuturuuu.com pay.tuturuuu.com pay.staging.tutur3u.com'),
    []
  );
});
test('repository configuration', () => assert.deepEqual(check(), []));

test('staging runtime regex cannot admit the production cookie zone', () => {
  assert.equal(violations('const STAGING_HOST = /tuturuuu\\.com/;').length, 1);
});

for (const token of [
  'beta',
  'cutover',
  'dev',
  'test',
  'qa',
  'next',
  'rc',
  'sandbox',
  'canary',
  'preview',
]) {
  for (const label of [token, `calendar-${token}`, `${token}-calendar`]) {
    test(`rejects non-production token ${label}`, () =>
      assert.equal(violations(`${label}.tuturuuu.com`).length, 1));
  }
}
test('production names containing token substrings remain allowed', () => {
  assert.deepEqual(
    violations(
      'calendar.tuturuuu.com developer.tuturuuu.com contest.tuturuuu.com betafoo.tuturuuu.com nextcloud.tuturuuu.com'
    ),
    []
  );
});

test('normalizes case, whitespace, scheme, userinfo, port, path and trailing dots', () => {
  for (const value of [
    'STAGING.TUTURUUU.COM',
    ' Staging.Tuturuuu.Com. ',
    'https://staging.tuturuuu.com:8443/path?q=1',
    'wss://user@staging.tuturuuu.com.:443',
  ])
    assert.equal(normalizeHost(value), 'staging.tuturuuu.com', value);
});

for (const [name, source, expected] of [
  ['uppercase', "host: 'STAGING.TUTURUUU.COM'", 'staging.tuturuuu.com'],
  [
    'mixed case',
    "host: 'Pay.Staging.Tuturuuu.Com'",
    'pay.staging.tuturuuu.com',
  ],
  ['trailing dot', "host: 'staging.tuturuuu.com.'", 'staging.tuturuuu.com'],
  ['scheme and port', 'URL=HTTPS://Dev.Tuturuuu.com:443/', 'dev.tuturuuu.com'],
  [
    'percent-encoded dot',
    'url: "staging%2Etuturuuu.com"',
    'staging.tuturuuu.com',
  ],
  [
    'string concat',
    "const h = 'staging.' +\n  'tuturuuu.com';",
    'staging.tuturuuu.com',
  ],
  [
    'template with a zone constant',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: source text fixture
    "const ZONE = 'tuturuuu.com';\nconst h = `preview.${ZONE}`;",
    'preview.tuturuuu.com',
  ],
  [
    'concat with a label constant',
    "const ENV = 'qa';\nconst h = ENV + '.tuturuuu.com';",
    'qa.tuturuuu.com',
  ],
  [
    'template with a label constant',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: source text fixture
    "const env = 'dev';\nconst h = `https://${env}.tuturuuu.com`;",
    'dev.tuturuuu.com',
  ],
  [
    'regex escapes',
    "new RegExp('^canary\\\\.tuturuuu\\\\.com$')",
    'canary.tuturuuu.com',
  ],
])
  test(`catches the ${name} bypass`, () =>
    assert.deepEqual(violations(source), [expected]));

test('catches non-production labels in a regex alternation', () => {
  assert.equal(
    violations(String.raw`const HOSTS = /^(calendar|staging)\.tuturuuu\.com$/;`)
      .length,
    1
  );
  assert.deepEqual(
    violations(String.raw`const HOSTS = /^(calendar|pay)\.tuturuuu\.com$/;`),
    []
  );
  assert.deepEqual(
    // biome-ignore lint/suspicious/noTemplateCurlyInString: source text fixture
    violations('const u = `https://${app}.tuturuuu.com`;'),
    []
  );
});

test('staging allowlists reject the production zone in any case or name', () => {
  for (const source of [
    'const STAGING_HOST = /TUTURUUU\\.COM/i;',
    "const stagingHosts = ['pay.tuturuuu.com'];",
    "export const StagingCookieDomain = '.Tuturuuu.Com';",
    "  stagingOrigins: ['https://tuturuuu.com'],",
  ])
    assert.deepEqual(
      violations(source),
      ['production cookie domain in staging allowlist'],
      source
    );
  assert.deepEqual(
    violations('const STAGING_HOST = /\\.staging\\.tutur3u\\.com$/;'),
    []
  );
});

test('scans every configuration location, not only app and script sources', () => {
  for (const file of [
    '.env.example',
    '.dev.vars',
    'Dockerfile',
    'infra/wrangler.toml',
    'apps/database/supabase/config.toml',
    'tooling/deploy.sh',
    'vercel.json',
    'apps/mobile/lib/config.dart',
  ])
    assert.equal(scannedFile(file), true, file);
  for (const file of [
    'scripts/check-staging-hosts.test.js',
    'docs-internal/build/devops/wave1-native-publishers.mdx',
    'packages/x/__tests__/hosts.ts',
    'bun.lock',
    'apps/web/public/logo.png',
  ])
    assert.equal(scannedFile(file), false, file);
});

test('check reports violations outside apps, packages and scripts', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'staging-hosts-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    '.env.example': 'NEXT_PUBLIC_APP_URL=https://Staging.Tuturuuu.com\n',
    'infra/wrangler.toml': 'route = "preview.tuturuuu.com/*"\n',
    'README.md': 'staging.tuturuuu.com is gone\n',
    'infra/hosts.test.js': "'staging.tuturuuu.com'\n",
  };
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), source);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  assert.deepEqual(check(root).sort(), [
    '.env.example: staging.tuturuuu.com',
    'infra/wrangler.toml: preview.tuturuuu.com',
  ]);
});

const MANAGED_PROJECT_FILES = [
  'apps/infrastructure/src/lib/infrastructure/projects.ts',
  'apps/web/src/lib/infrastructure/project-model.ts',
  'scripts/watch-blue-green/projects.js',
];

test('no file is exempt: a labeled production host fails even in a deny-list', () => {
  const list =
    "const RESERVED_MANAGED_PROJECT_HOSTNAMES = new Set(['dev.tuturuuu.com']);";
  for (const file of MANAGED_PROJECT_FILES)
    assert.deepEqual(violations(list), ['dev.tuturuuu.com'], file);
});

test('managed-project consumers use the shared zone rule, not local lists', () => {
  for (const file of MANAGED_PROJECT_FILES) {
    const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(source, /RESERVED_MANAGED_PROJECT_HOSTNAMES/u, file);
    assert.match(source, /isReservedManagedProjectHostname\(hostname\)/u, file);
    assert.match(
      source,
      /@tuturuuu\/utils\/managed-project-hostnames|packages\/utils\/src\/managed-project-hostnames-core\.cjs/u,
      file
    );
  }
});

for (const [name, source] of [
  ['fullwidth dot', "host: 'staging．tuturuuu．com'"],
  ['ideographic dot', "host: 'staging。tuturuuu。com'"],
  ['octal escape', String.raw`host: 'staging\056tuturuuu\56com'`],
  ['decimal entity', 'href="https://staging&#46;tuturuuu&#046;com"'],
  ['hex entity', 'href="https://staging&#x2E;tuturuuu&#x2e;com"'],
  ['named entity', 'href="https://staging&period;tuturuuu&period;com"'],
  ['unicode escape', String.raw`host: 'staging\u{2E}tuturuuu.com'`],
])
  test(`catches the ${name} bypass`, () =>
    assert.deepEqual(violations(source), ['staging.tuturuuu.com']));

test('a production-zone label inside a longer foreign host is not a match', () => {
  for (const source of [
    "host: 'evil-staging.tuturuuu.com.attacker.net'",
    "host: 'staging.tuturuuu.com-evil.net'",
    "host: 'staging.eviltuturuuu.com'",
    "host: 'staging-tuturuuu.com'",
    "const stagingHosts = ['eviltuturuuu.com', 'tuturuuu.com.attacker.net'];",
  ])
    assert.deepEqual(violations(source), [], source);
  assert.deepEqual(
    violations("const stagingHosts = ['eviltuturuuu.com', '.tuturuuu.com'];"),
    ['production cookie domain in staging allowlist']
  );
  assert.deepEqual(violations("host: 'xn--evil.staging.tuturuuu.com'"), [
    'xn--evil.staging.tuturuuu.com',
  ]);
});

test('catches non-production alternations in front of a production subdomain', () => {
  for (const source of [
    String.raw`const HOSTS = /^(staging|preview)\.calendar\.tuturuuu\.com$/;`,
    String.raw`new RegExp('(dev|staging)\\.mail\\.tuturuuu\\.com')`,
    "pattern: '(staging|beta).api.tuturuuu.com/*'",
    '/(staging|beta)*.tuturuuu.com/',
    String.raw`/^(?:[a-z]+-)?(staging|canary)\.app\.tuturuuu\.com$/`,
  ])
    assert.equal(violations(source).length, 1, source);
  assert.deepEqual(
    violations(String.raw`/^(calendar|mail)\.app\.tuturuuu\.com$/`),
    []
  );
});

for (const [name, source] of [
  [
    'fullwidth letters',
    "host: 'calendar-staging.\uff34\uff35\uff34\uff35\uff32\uff35\uff35\uff35.com'",
  ],
  ['hex letter escape', "host: 'st\\x61ging.tuturuuu.com'"],
  ['unicode letter escape', "host: '\\u0053taging.tuturuuu.com'"],
  ['octal letter escape', "host: '\\163taging.tuturuuu.com'"],
  ['numeric entity letters', 'href="https://&#83;TAGING.tuturuuu.com"'],
  ['escaped ideographic dot', "host: 'staging\\u3002tuturuuu.com'"],
  ['escaped fullwidth letter', "host: 'staging.\\uff54uturuuu.com'"],
])
  test(`catches the ${name} bypass`, () =>
    assert.equal(violations(source).length, 1, source));

test('long backslash runs normalize in linear time', () => {
  const started = performance.now();
  violations(`'${'\\'.repeat(200_000)}x tuturuuu.com'`);
  assert.ok(performance.now() - started < 500);
});

test('detects hosts concatenated across comments', () => {
  for (const comment of ['/* hidden */', '// hidden\n']) {
    assert.ok(
      violations(`const host = "dev." + ${comment} "tuturuuu.com";`).length
    );
  }
  assert.ok(violations('const host = "https://dev.tuturuuu.com";').length);
  assert.equal(
    violations('const host = "https://dev.staging.tutur3u.com";').length,
    0
  );
});

test('regex literals cannot open a block comment that hides a host', () => {
  for (const source of [
    "const re = /\\/*/;\nconst host = 'dev.tuturuuu.com';",
    "if (/\\/*/.test(x)) host = 'dev.tuturuuu.com';",
    "x = a ? /\\/*/ : 1; const h = 'staging.tuturuuu.com';",
    "return /[/*]/g.test(s) && 'dev.tuturuuu.com';",
    "const re = /\"/; const h = 'dev.tuturuuu.com';",
    "const re = /'/; const h = 'dev.tuturuuu.com';",
    "const re = /`/; const h = 'dev.tuturuuu.com';",
    "if (ok) /\\/*/.test(s); const h = 'dev.tuturuuu.com';",
  ])
    assert.equal(violations(source).length, 1, source);
});

test('strings containing comment openers do not hide a host', () => {
  for (const source of [
    "const a = '/*'; const h = 'dev.tuturuuu.com';",
    'const a = "/*"; const h = "dev.tuturuuu.com";',
    'const a = `/*`; const h = `dev.tuturuuu.com`;',
    "const a = '//'; const h = 'dev.tuturuuu.com';",
  ])
    assert.equal(violations(source).length, 1, source);
});

test('URLs with // do not start a comment', () => {
  assert.equal(
    violations('const u = "https://example.com"; const h = "dev.tuturuuu.com";')
      .length,
    1
  );
  assert.equal(
    violations('URL=https://example.com\nHOST=dev.tuturuuu.com').length,
    1
  );
  assert.equal(violations('url: https://dev.tuturuuu.com/path').length, 1);
});

test('real comments are still stripped', () => {
  assert.equal(stripComments('a /* dev.tuturuuu.com */ b').trim(), 'a   b');
  assert.equal(stripComments('a // dev.tuturuuu.com\nb'), 'a \nb');
  assert.equal(
    stripComments('x = 1 / 2; // dev.tuturuuu.com\n'),
    'x = 1 / 2; \n'
  );
  assert.equal(stripComments('x = (a) / 2 /* c */;').includes('c'), false);
  assert.deepEqual(violations('// dev.tuturuuu.com'), []);
  assert.deepEqual(violations('/* dev.tuturuuu.com */'), []);
  assert.deepEqual(violations('const re = /a+/g; // dev.tuturuuu.com'), []);
  assert.deepEqual(violations('const n = a / b; /* dev.tuturuuu.com */'), []);
});

test('regex literals are kept verbatim', () => {
  assert.equal(stripComments('const re = /\\/*/gi;'), 'const re = /\\/*/gi;');
  assert.equal(stripComments('x = /[/]/;'), 'x = /[/]/;');
  assert.equal(violations('const re = /dev\\.tuturuuu\\.com/;').length, 1);
});

test('division is not misread as a regex that hides a host', () => {
  for (const source of [
    'const n = (1) / "/ /*" / 1;\nconst host = "dev.tuturuuu.com";',
    "const n = x / '/ /*' / 1; const host = 'dev.tuturuuu.com';",
    'const n = a++ / "/ /*" / 1; const host = "dev.tuturuuu.com";',
    'const n = {} / "/ /*" / 1;\nconst host = "dev.tuturuuu.com";',
    'const n = [1] / "/ /*" / 1;\nconst host = "dev.tuturuuu.com";',
  ])
    assert.equal(violations(source).length, 1, source);
});

test('comments and whitespace after a keyword do not defeat regex detection', () => {
  for (const source of [
    'function f() { return /* explanation */ /\\/*/; }\nconst host = "dev.tuturuuu.com";',
    `function f() { return${' '.repeat(40)}/\\/*/; }\nconst host = "dev.tuturuuu.com";`,
    'function f() { return // why\n /\\/*/; }\nconst host = "dev.tuturuuu.com";',
    'x = typeof /* c */ /\\/*/; const host = "dev.tuturuuu.com";',
    'if (ok) /* c */ /\\/*/.test(s); const host = "dev.tuturuuu.com";',
  ])
    assert.equal(violations(source).length, 1, source);
});

test('mixed ambiguous sites cannot hide a host in every reading', () => {
  assert.equal(
    violations(
      'const n = {} / "/ /*" / 1;\nfoo({}) /\\/*/.test(s);\nconst host = "dev.tuturuuu.com";\n/* end */'
    ).length,
    1
  );
});

test('property names that look like keywords stay division', () => {
  assert.equal(
    violations('x = a.return / "/ /*" / 1; h = "dev.tuturuuu.com";').length,
    1
  );
});

test('an unterminated block comment is scanned, not stripped', () => {
  assert.equal(violations("h = 'dev.tuturuuu.com'; /* never closed").length, 1);
  assert.equal(violations("rm /tmp/*\nh = 'dev.tuturuuu.com'").length, 1);
});

test('too many ambiguous sites fail closed to scanning comments', () => {
  const ambiguous = '{} /\\/*/ ;\n'.repeat(40);
  assert.equal(violations(`${ambiguous}// dev.tuturuuu.com\n`).length, 1);
});

test('C-style comments are stripped only for JS, TS and CSS-family files', () => {
  const commented = 'a /* dev.tuturuuu.com */ b';
  for (const file of [
    'a.js',
    'a.mjs',
    'a.cjs',
    'a.ts',
    'a.tsx',
    'a.jsx',
    'a.mts',
    'a.css',
    'a.scss',
    'a.less',
  ]) {
    assert.equal(violations(commented, file).length, 0, file);
    assert.equal(
      stripCommentVariants(commented, file)[0].includes('dev'),
      false
    );
  }
  for (const file of [
    'a.sh',
    'a.sql',
    'a.yaml',
    'a.yml',
    '.env',
    'Dockerfile',
  ]) {
    assert.deepEqual(stripCommentVariants(commented, file), [commented], file);
    assert.equal(violations(commented, file).length, 1, file);
  }
});

test('a shell glob /* cannot swallow a staging host', () => {
  const script =
    'ls /var/log/*\nSTAGING=dev.tuturuuu.com\necho done # see /tmp/x */\n';
  assert.equal(violations(script, 'deploy.sh').length, 1);
  assert.equal(violations(script, 'scripts/run.bash').length, 1);
  // Without a file the JS/TS reading applies, which would have hidden the host.
  assert.equal(violations(script).length, 0);
});

test('SQL text containing /* cannot swallow a staging host', () => {
  const sql =
    "select '/*' as a;\ninsert into hosts values ('staging.tuturuuu.com');\nselect '*/';\n";
  assert.equal(violations(sql, 'supabase/migrations/1_hosts.sql').length, 1);
  assert.equal(
    violations(
      "-- /* note\nupdate t set h = 'preview.tuturuuu.com';\n-- */\n",
      'a.sql'
    ).length,
    1
  );
});

test('YAML text containing /* or // cannot swallow a staging host', () => {
  const yaml =
    'paths:\n  - src/*\nhost: next.tuturuuu.com\nglob: "docs/*/index.md" # */\n';
  assert.equal(violations(yaml, '.github/workflows/ci.yaml').length, 1);
  assert.equal(violations(yaml, 'config.yml').length, 1);
  assert.equal(
    violations('a: // x\nhost: qa.tuturuuu.com\n', 'config.yaml').length,
    1
  );
});

test('check() passes the file name so non-JS files are not stripped', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'staging-hosts-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  writeFileSync(
    path.join(root, 'run.sh'),
    'ls /var/*\nH=dev.tuturuuu.com\n# */\n'
  );
  writeFileSync(path.join(root, 'ok.js'), '/* dev.tuturuuu.com */\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  assert.deepEqual(check(root), ['run.sh: dev.tuturuuu.com']);
});

test('a comment between the pieces of a split string cannot hide a host', () => {
  const dart = "const host = 'dev.' /* x */ + 'tuturuuu.com';\n";
  const go = 'host := "dev." + // x\n  "tuturuuu.com"\n';
  assert.equal(violations(dart, 'lib/config.dart').length, 1);
  assert.equal(violations(go, 'cmd/main.go').length, 1);
  // Verbatim source stays in the mix, so a glob-like `/*` cannot swallow a host.
  const globbed = 'a := "/*"\nb := "dev.tuturuuu.com"\nc := "*/"\n';
  assert.equal(violations(globbed, 'cmd/main.go').length, 1);
  // Non-C-comment files are still scanned verbatim only.
  assert.deepEqual(stripCommentVariants(dart, 'a.sh'), [dart]);
});
