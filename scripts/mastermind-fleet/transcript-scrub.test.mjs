import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scrubTranscriptText } from './bridge-rpc.mjs';

// Shapes of real credentials, every value made up. The bodies sit in their own
// list and are joined to names and prefixes at run time, so this file holds
// nothing a scanner would take for a live value. Each must leave no trace of
// its body in a transcript.
const glue = (...parts) => parts.join('');
const BODY = [
  'AbCdEf0123456789',
  'ZyXwVu9876543210',
  '0123456789abcdefghij',
  'aBcDeFgHiJkL',
  'abcdefghijklmnop',
  'AbCdEfGhIjKlMnOp',
  'IOSFODNN7EXAMPLE',
  'wJalrXUtnFEMI',
  'SyA1b2C3d4E5f6',
  '51AbCdEfGhIjKlMn',
  'eyJzdWIiOiIxMjM0',
  'abcDEF123456',
  'Zx9Yw8Vu7Ts6',
  'correct-horse',
  '9f8e7d6c5b4a3210',
  'QUJDREVGR0hJSktM',
  'MIIEvQIBADANBgkq',
  'supersecretvalue1',
  'hunter2',
  'horse battery',
  'hunter2hunter2',
  's3cr3t-pass',
  's3cr3t',
  'dXNlcjpwYXNzd29y',
  '00112233445566778899',
  'abc123def4567890',
];
const [
  B0,
  B1,
  B2,
  B3,
  B4,
  B5,
  B6,
  B7,
  B8,
  B9,
  B10,
  B11,
  B12,
  B13,
  B14,
  B15,
  B16,
  B17,
  B18,
  B19,
  B20,
  B21,
  B22,
  B23,
  B24,
  B25,
] = BODY;
const CREDENTIALS = [
  ['OpenAI-style', glue('sk', '-proj-', B0, B0), B0],
  ['Anthropic-style', glue('sk', '-ant-', 'a', 'pi03-', B1, B1), B1],
  ['GitHub classic', glue('gh', 'p_', B2, 'ABCDEFGHIJ012345'), B2],
  [
    'GitHub fine-grained',
    glue('github', '_pat_', '11ABCDEFG0', B3, '_mNoPqRsTuVwXyZ0123456789'),
    B3,
  ],
  ['GitHub app', glue('gh', 's_', B4, 'qrstuvwxyz0123456789'), B4],
  ['GitLab', glue('gl', 'pat-', B5, 'QrSt'), B5],
  [
    'Slack bot',
    glue('xo', 'xb-', '123456789012', '-123456789012-', B5, 'QrStUvWx'),
    B5,
  ],
  ['AWS id', glue('AK', 'IA', B6), B6],
  [
    'AWS assignment',
    glue(
      'aws_',
      'secret',
      '_access_',
      'key',
      ' = ',
      B7,
      '/K7MDENG/',
      'bPxRfiCYEXAMPLEKEY'
    ),
    B7,
  ],
  ['Google', glue('AI', 'za', B8, 'G7h8I9j0K1l2M3n4O5p6Q'), B8],
  ['Stripe live', glue('sk', '_live_', B9, 'OpQrStUv'), B9],
  [
    'JWT',
    glue(
      'ey',
      'JhbGciOiJIUzI1NiJ9',
      '.',
      B10,
      'NTY3ODkwIn0',
      '.',
      'dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    ),
    B10,
  ],
  [
    'Bearer header',
    glue('Authorization: ', 'Bearer ', B11, '.ghiJKL-789_mno'),
    B11,
  ],
  [
    'Cloudflare-style',
    glue('CLOUDFLARE_', 'API_', 'TOKEN', '=', B12, 'Rq5Po4Nm3Lk2Ji1Hg0Fe'),
    B12,
  ],
  ['quoted assignment', glue('DB_', 'PASSWORD', ': "', B13, '-battery"'), B13],
  [
    'env assignment',
    glue('SUPABASE_', 'SECRET', '_', 'KEY', '=', 'sb_', B0),
    B0,
  ],
  ['hex', glue('signing value ', B14.repeat(4)), B14],
  ['base64', glue('value ', `${B15}TU5PUFFSU1RVVldYWVo`.repeat(2), '='), B15],
  [
    'PEM block',
    glue(
      '-----BEGIN ',
      'PRIVATE ',
      'KEY-----\n',
      B16,
      'hkiG9w0BAQEFAASC\nBKcwggSjAgEAAoIBAQC7\n',
      '-----END ',
      'PRIVATE ',
      'KEY-----'
    ),
    B16,
  ],
  [
    'npm',
    glue('npm_', 'token', '=', 'npm', '_', B5, 'QrStUvWxYz0123456789'),
    B5,
  ],
  [
    'JSON value',
    glue('{"a', 'pi_', 'key', '":"', B17, '","region":"sgp"}'),
    B17,
  ],
  ['JSON short value', glue('{"pass', 'word', '": "', B18, '"}'), B18],
  [
    'JSON value with spaces',
    glue('{"DB_', 'PASSWORD', '": "correct ', B19, ' staple"}'),
    B19,
  ],
  [
    'env value with spaces',
    glue('DB_', 'PASSWORD', '=correct ', B19, ' staple'),
    B19,
  ],
  [
    'quoted value with spaces',
    glue('pass', 'word', ": 'correct ", B19, " staple'"),
    B19,
  ],
  ['short pwd assignment', glue('pwd', '=', B20), B20],
  [
    'bare cloud value',
    glue('it is ', B7, '/K7MDENG/', 'bPxRfiCYEXAMPLEKEY', ' here'),
    B7,
  ],
  [
    'database URL',
    glue('postgres://migrate:', B21, '@db.internal:5432/app'),
    B21,
  ],
  ['webhook URL', glue('https://user:', B22, '@example.com/hook'), B22],
  ['Basic header', glue('Authorization: ', 'Basic ', B23, 'ZA=='), B23],
  ['32-character hex', glue('value ', B24, 'aabbccddeeff'), B24],
  ['private assignment', glue('PRIVATE_', 'KEY', '="0x', B25, ' extra"'), B25],
];

test('redacts every credential shape in the corpus and keeps the surrounding text', () => {
  for (const [name, credential, secretPart] of CREDENTIALS) {
    const { text } = scrubTranscriptText(
      `Before the value.\n${credential}\nAfter the value in ./apps/web/src/x.ts`
    );
    assert.ok(!text.includes(secretPart), `${name} leaked: ${text}`);
    assert.ok(text.includes('[redacted]'), name);
    assert.ok(text.startsWith('Before the value.\n'), name);
    assert.ok(text.endsWith('\nAfter the value in ./apps/web/src/x.ts'), name);
  }
});

test('redacts secrets that try to pass as something ordinary', () => {
  for (const [text, secretPart] of [
    // Not a 40-character commit id, whatever the word in front says.
    ['commit 0123456789abcdef0123456789abcdef', '0123456789abcdef'],
    [`sha ${'ab12'.repeat(11)}`, 'ab12ab12ab12'],
    ['/blob/00112233445566778899aabbccddeeff', '0011223344556677'],
    // Wide spacing, and a value longer than any quoted one.
    ['password     = hunter2secret', 'hunter2secret'],
    [`api_key=${'a'.repeat(430)}`, 'aaaaaaaa'],
    [`"token": "${'b'.repeat(500)}"`, 'bbbbbbbb'],
  ])
    assert.ok(!scrubTranscriptText(text).text.includes(secretPart), text);
});

test('leaves ordinary transcript text alone', () => {
  for (const plain of [
    'Ran `bun check:changed` in apps/web; 14 tests passed.\n\n- step one\n- step two',
    'See https://github.com/tutur3u/platform/pull/1234 and commit 80418170c7.',
    'The token bucket refills every 60 seconds; the secret is to batch writes.',
    'Đã triển khai bản phát hành lên tuturuuu.com lúc 23:26.',
    'UUID 123e4567-e89b-12d3-a456-426614174000 and sha 1c2b3e335b1a9eff0a7d',
    // A commit id named as one, and a long path, stay readable.
    'Landed in commit 0123456789abcdef0123456789abcdef01234567 on main.',
    'See https://github.com/tutur3u/platform/commit/0123456789abcdef0123456789abcdef01234567',
    'Edited apps/web/src/app/api/v1/mastermind/fleet/threads/messages/route.ts and its test.',
    // Words that only start like a key prefix or a scheme name.
    'Use basic authentication here; basic information is enough.',
    'She skillfully kept a sketchbook; skip-this-step if npm_config_registry is set.',
    'The sklearn-model and pkg-config notes mention rkt and a bearer of news.',
  ])
    assert.deepEqual(scrubTranscriptText(plain), {
      text: plain,
      truncated: false,
    });
  // Invisible and bidi-control characters are removed.
  assert.equal(scrubTranscriptText('a​b‮c').text, 'abc');
});

test('scans a bounded part of a huge message, in time that does not explode', () => {
  // Long words built from the keywords, with no separator: the shape that
  // makes an unbounded pattern quadratic.
  for (const hostile of [
    'secret'.repeat(40_000),
    'token-'.repeat(40_000),
    `${'password_'.repeat(20_000)}=x`,
    `-----BEGIN ${'A'.repeat(200_000)}`,
  ]) {
    const started = process.hrtime.bigint();
    const { text, truncated } = scrubTranscriptText(hostile);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < 1500, `${Math.round(ms)} ms for ${hostile.length} chars`);
    assert.ok(text.length <= 4000);
    assert.equal(truncated, true);
  }
});
