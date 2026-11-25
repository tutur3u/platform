import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { storeApiErrorDiagnostic } from './store-api-diagnostic.mjs';
import {
  json,
  storeApiErrorDiagnostic as reexported,
} from './verify-store.mjs';

const WITHHELD = '[message withheld: unrecognised]';
const reviewHint =
  'Changes cannot be sent for review automatically. Please set the query parameter changesNotSentForReview to true.';

function diagnostic(message) {
  return storeApiErrorDiagnostic({ error: { message } });
}

function withheld(normalized) {
  const hash = createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 8);
  return `${WITHHELD} sha256:${hash}`;
}

test('verify-store keeps exporting the diagnostic', () => {
  assert.equal(reexported, storeApiErrorDiagnostic);
});

for (const phrase of [
  'Changes cannot be sent for review automatically.',
  reviewHint,
  `${reviewHint} Once committed, you can manually send the changes for review in the Google Play Console.`,
  'Changes cannot be set to not be sent for review.',
  'Managed publishing is enabled.',
  'Version code has already been used.',
  'Release notes are too long.',
  'Track not found.',
  'No testers are configured for this track.',
  'No countries or regions are selected for this track.',
  'Only releases with status draft may be created on draft app.',
  'App content declarations are incomplete.',
]) {
  test(`Play emits the known phrase "${phrase}"`, () => {
    assert.equal(diagnostic(phrase), phrase);
  });
}

test('normalizes encoded text, Unicode spaces, format and control characters before matching', () => {
  assert.equal(
    diagnostic(
      reviewHint
        .replace('Changes cannot', '%2543hanges\u00a0canno\u0000t')
        .replace('changesNot', 'changes\u200bＮot')
    ),
    reviewHint
  );
  assert.equal(diagnostic('Track\n\r\t not found.'), 'Track not found.');
  assert.equal(diagnostic('Track%00 not found.'), 'Track not found.');
  assert.equal(diagnostic('bad%ZZ%41%FF'), withheld('bad%ZZ%41%FF'));
});

test('Play hashes normalized unrecognized messages and omits hashes above the input cap', () => {
  assert.equal(diagnostic('unknown  reason'), withheld('unknown reason'));
  assert.equal(
    diagnostic('unknown\u00a0reason'),
    diagnostic('unknown  reason')
  );
  assert.equal(diagnostic('a'.repeat(8192)), withheld('a'.repeat(8192)));
  assert.equal(diagnostic('a'.repeat(8193)), WITHHELD);
});

test('Play diagnostics accept only known structured values and ignore opaque path segments', () => {
  assert.equal(
    storeApiErrorDiagnostic({
      error: {
        code: 400,
        status: 'FAILED_PRECONDITION',
        message: reviewHint,
        errors: [{ reason: 'changesNotSentForReview', message: 'private' }],
        details: [
          {
            reason: 'changesInReviewBehavior',
            metadata: { private: 'Private metadata' },
            violations: [
              {
                field: 'releases[0].releaseNotes[0].language',
                description: 'Private description',
              },
              { field: 'releases[0].client_secret' },
              { field: 'releases[0].abcdef012345678' },
              { field: 'releases[0].QWxwaGFCZXRhR2FtbWFEZWx' },
              { field: 'com.example.private' },
            ],
          },
          { reason: 'abc123opaque' },
        ],
      },
    }),
    `FAILED_PRECONDITION, 400, changesNotSentForReview, changesInReviewBehavior, releases[0].releaseNotes[0].language, ${reviewHint}`
  );
  assert.equal(
    storeApiErrorDiagnostic({
      error: { status: 'PRIVATE_ACCOUNT', code: 1234567 },
    }),
    ''
  );
  assert.equal(
    storeApiErrorDiagnostic({ error: 'private provider diagnostics' }),
    ''
  );
});

test('Play inspects at most eight entries per structured diagnostics array', () => {
  const prefix = Array.from({ length: 7 }, () => ({}));
  assert.equal(
    storeApiErrorDiagnostic({
      error: {
        errors: [...prefix, { reason: 'required' }, { reason: 'forbidden' }],
        details: [
          ...prefix,
          {
            reason: 'invalid',
            violations: [...prefix, { field: 'track' }, { field: 'releases' }],
          },
          { reason: 'badRequest' },
        ],
      },
    }),
    'required, invalid, track'
  );
});

const privateInputs = [
  'ja\u200bne@example.com',
  'jane\u200b@example.com',
  'jane\u00a0@example.com',
  'jane%2Bbeta%40example.com',
  'jane.doe%40example.com',
  'https%3A%2F%2Fa.b%2Fc',
  'client_secret=abc123',
  'access_token=abc123',
  'refresh_token=abc123',
  'private_key_id=abc123',
  'client_id=abc123',
  'api-key=abc123',
  'password=abc123',
  'secret=abc123',
  'token=abc123',
  'key=abc123',
  'Bearer abc',
  'Basic dXNlcjpwYXNz',
  'QWxwaGFCZXRhR2FtbWFEZWx',
  'abcdef012345678',
  'a.b/path?code=4/short',
  'example.com',
  '+84 123 456 789',
  'com.example.private',
  '123456789012',
  '\n::warning::private',
  '\u001b[31mprivate\u001b[0m',
];
for (const [index, value] of privateInputs.entries()) {
  test(`Play withholds unrecognized private fixture ${index + 1}`, () => {
    assert.match(
      diagnostic(`${reviewHint} ${value}`),
      /^\[message withheld: unrecognised\] sha256:[0-9a-f]{8}$/u
    );
    assert.equal(
      storeApiErrorDiagnostic({
        error: {
          errors: [{ reason: value }],
          details: [{ violations: [{ field: `releases[0].${value}` }] }],
        },
      }),
      ''
    );
  });
}

test('Google Play edit errors omit package and edit identifiers', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({ error: { status: 'INVALID_ARGUMENT', code: 400 } }),
        { status: 400 }
      )
  );
  await assert.rejects(
    json(
      'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.private/edits/opaque-edit:commit'
    ),
    {
      message:
        'Store API request failed (400, /androidpublisher/v3/applications/[redacted]/edits/[redacted]:commit; INVALID_ARGUMENT, 400)',
    }
  );
});

test('App Store Connect diagnostics retain their code and pointer output', () => {
  assert.equal(
    storeApiErrorDiagnostic({
      errors: [
        {
          code: 'ENTITY_ERROR',
          detail: 'private',
          source: { pointer: '/data/attributes/build' },
        },
        {
          code: 'leak@example.com',
          source: { pointer: '/data/attributes/user@example.com' },
        },
        { code: 'ENTITY_ERROR.ATTRIBUTE.REQUIRED' },
        { code: 'FOURTH' },
      ],
    }),
    'ENTITY_ERROR at /data/attributes/build, ENTITY_ERROR.ATTRIBUTE.REQUIRED'
  );
});

test('Google BadRequest field violations emit known pointers without descriptions', () => {
  const fieldViolations = [
    { field: 'releases[0].releaseNotes[0].text', description: 'private' },
    { field: 'releases[0].shortSecret' },
    ...Array.from({ length: 6 }, () => ({})),
    { field: 'track' },
  ];
  assert.equal(
    storeApiErrorDiagnostic({
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        details: [{ fieldViolations }],
      },
    }),
    'INVALID_ARGUMENT, 400, releases[0].releaseNotes[0].text'
  );
});

test('Play request errors omit identifiers and reject Apple-shaped bodies', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          errors: [
            {
              code: 'abc123',
              source: { pointer: '/data/attributes/privateId' },
            },
          ],
        }),
        { status: 400 }
      )
  );
  const base =
    'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.private';
  for (const [suffix, expected] of [
    ['/edits/opaque-edit/tracks/private-track', '/edits/[redacted]/tracks'],
    ['/tracks/private-track/releases', '/tracks/[redacted]/releases'],
    ['/unknown/private-id', '/[redacted]'],
  ]) {
    await assert.rejects(json(base + suffix), {
      message: `Store API request failed (400, /androidpublisher/v3/applications/[redacted]${expected})`,
    });
  }
  await assert.rejects(
    json('https://api.appstoreconnect.apple.com/v1/builds'),
    {
      message:
        'Store API request failed (400, /v1/builds; abc123 at /data/attributes/privateId)',
    }
  );
});
