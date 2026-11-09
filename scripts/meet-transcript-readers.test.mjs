import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = JSON.parse(
  readFileSync(
    new URL('./fixtures/meet-transcript-readers.json', import.meta.url),
    'utf8'
  )
);
const digest = (source) => createHash('sha256').update(source).digest('hex');
// Pin table access AND its downstream projection consumers, including SQL RPCs/views.
const references = (source) =>
  /\bmeet_ai_chunks\b|meetings\/transcript|\bMeetAiChunk\b|\bMeetingTranscript\b|\breadTranscriptChunk\b|\bformatTranscriptChunk\b/.test(
    source
  );
function inventory(directory) {
  return readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory())
      return [
        'node_modules',
        '.git',
        '.next',
        '.turbo',
        'dist',
        'coverage',
        'tmp',
      ].includes(entry.name)
        ? []
        : inventory(file);
    if (
      !entry.isFile() ||
      !/\.(?:[cm]?[jt]sx?|sql)$/.test(file) ||
      /(?:\.test\.|\.spec\.|\.d\.ts$|\/__tests__\/|\/__fixtures__\/|\/supabase\/tests\/|packages\/types\/src\/supabase.ts$)/.test(
        file
      )
    )
      return [];
    const source = readFileSync(path.join(root, file), 'utf8');
    return references(source) ? [[file, digest(source)]] : [];
  });
}
const check = (entries) =>
  assert.deepEqual(
    Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))),
    baseline,
    'Transcript reader surface changed: review every reader and marker projection before updating this allowlist.'
  );
test('all transcript table readers and projection consumers stay reviewed', () =>
  check(['apps', 'packages', 'scripts'].flatMap(inventory)));
for (const [name, source] of Object.entries({
  export: "db.from('meet_ai_chunks').select('transcript,usage')",
  search: 'select c.transcript from public.meet_ai_chunks c',
  context: "db.from('meet_ai_chunks').select('*')",
  view: 'create view transcript_export as select usage from public.meet_ai_chunks',
  consumer: "import type { MeetAiChunk } from '@tuturuuu/internal-api';",
}))
  test(`tripwire rejects a new ${name} reader`, () => {
    assert.ok(references(source));
    assert.throws(
      () =>
        check([
          ...Object.entries(baseline),
          [`fixture/${name}.ts`, digest(source)],
        ]),
      /Transcript reader surface changed/
    );
  });
test('tripwire rejects a direct reader added inside an already reviewed file', () => {
  const entries = Object.entries(baseline);
  assert.ok(entries.length);
  entries[0][1] = digest('new direct transcript reader');
  assert.throws(() => check(entries), /Transcript reader surface changed/);
});
