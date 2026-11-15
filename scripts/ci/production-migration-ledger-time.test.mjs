import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { ledgerTime, parseLedger } from './production-migration-only.mjs';

// Time (UTC) cells follow v2.121.0 FormatTimestampVersion: canonical text when
// Go time.Parse("20060102150405") accepts the version, otherwise the version.
const VALID = {
  20240229000000: '2024-02-29 00:00:00',
  20000229235959: '2000-02-29 23:59:59',
  20251231235959: '2025-12-31 23:59:59',
  20230202082703: '2023-02-02 08:27:03',
};
const INVALID = [
  '20230229000000',
  '19000229000000',
  '20251301000000',
  '20250100000000',
  '20250003120000',
  '20250431120000',
  '20250703240000',
  '20250703036927',
  '20250703120060',
];
const canonicalText = (v) =>
  `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)} ${v.slice(8, 10)}:${v.slice(10, 12)}:${v.slice(12, 14)}`;
const ledger = (rows) =>
  '  Local | Remote | Time (UTC)\n -------|--------|----------------------\n' +
  rows.map(([v, time]) => ` \`${v}\` | \`${v}\` | \`${time}\``).join('\n') +
  '\n';

test('ledger time mirrors Go calendar validity for the pinned layout', () => {
  for (const [version, time] of Object.entries(VALID))
    assert.equal(ledgerTime(version), time);
  for (const version of INVALID) assert.equal(ledgerTime(version), version);
  for (const bad of ['2024022900000', '202402290000000', '2024-02-29', ''])
    assert.throws(() => ledgerTime(bad), /Malformed ledger version/);
});

test('ledger accepts exactly one Time rendering per version', () => {
  const rows = [
    ['20240229000000', '2024-02-29 00:00:00'],
    ['20250703036927', '20250703036927'],
    ['20250703120060', '20250703120060'],
  ];
  const parsed = parseLedger(
    ledger(rows),
    rows.map(([v]) => v)
  );
  assert.deepEqual(parsed.pending, []);
  assert.deepEqual(
    parsed.remote,
    rows.map(([v]) => v)
  );
});

test('forged ledger Time cells are rejected', () => {
  const forged = {
    canonicalForInvalid: ['20250703036927', canonicalText('20250703036927')],
    literalForValid: ['20240229000000', '20240229000000'],
    differentValidTime: ['20240229000000', '2024-02-29 00:00:01'],
    shiftedInvalid: ['20250703036927', '20250703036928'],
    doubledSpace: ['20240229000000', '2024-02-29  00:00:00'],
    isoSeparator: ['20240229000000', '2024-02-29T00:00:00'],
    unpaddedField: ['20240229000000', '2024-2-29 00:00:00'],
    paddedYear: ['20240229000000', '02024-02-29 00:00:00'],
    innerLiteralSpace: ['20250703036927', '2025070303 6927'],
    tabInsideTime: ['20240229000000', '2024-02-29\t00:00:00'],
  };
  for (const [label, [version, time]] of Object.entries(forged))
    assert.throws(
      () => parseLedger(ledger([[version, time]]), [version]),
      /Duplicate or malformed ledger row/,
      label
    );
});

test('real pinned capture renders exactly the invalid calendar versions literally', () => {
  const text = fs.readFileSync(
    new URL(
      './fixtures/production-migration-cli-2.121.0-all-applied.stdout',
      import.meta.url
    ),
    'utf8'
  );
  const rows = [
    ...text.matchAll(/^\s*`(\d{14})`\s*\|\s*`\d{14}`\s*\|\s*`([^`]*)`\s*$/gm),
  ].map((match) => [match[1], match[2]]);
  assert.equal(rows.length, 1575);
  const literal = rows.filter(([v, time]) => v === time).map(([v]) => v);
  assert.deepEqual(literal, [
    '20250703036927',
    '20260120086000',
    '20260801210196',
    '20260801210197',
    '20260801210198',
    '20260801210199',
    '20261027151460',
    '20261027151470',
    '20261027151480',
  ]);
  for (const [version, time] of rows) assert.equal(time, ledgerTime(version));
  const versions = rows.map(([v]) => v);
  const row = '`20250703036927` | `20250703036927` | `20250703036927`';
  const validRow =
    '`20230202082703` | `20230202082703` | `2023-02-02 08:27:03`';
  for (const [from, to] of [
    [row, row.replace(/`20250703036927`$/, '`2025-07-03 03:69:27`')],
    [validRow, validRow.replace(/`[^`]*`$/, '`20230202082703`')],
  ]) {
    assert.equal(text.split(from).length, 2);
    assert.throws(
      () => parseLedger(text.replace(from, to), versions),
      /Duplicate or malformed ledger row/
    );
  }
});
