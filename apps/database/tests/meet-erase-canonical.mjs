// Run with bun, then pipe the emitted pgTAP SQL to the disposable PG17 database.
// Shares V9's canonical module; no credentials or hosted database access.
import { createHash } from 'node:crypto';
import { canonicalEraseJson } from '../../../packages/meet-core/src/features/meeting-ai/server/erase-canonical-json.ts';

const vector = {
  z: [1, true, null],
  a: { '\uE000': 2, '\u{10000}': 3 },
  safe: 9007199254740991,
};
const hash = createHash('sha256')
  .update(canonicalEraseJson(vector))
  .digest('hex');
console.log(`begin; create extension if not exists pgtap with schema extensions; set local search_path=public,extensions; select no_plan();
select is(encode(sha256(convert_to(private.meet_erase_canonical_json('${JSON.stringify(vector)}'::jsonb),'UTF8')),'hex'),'${hash}',
'SQL and V9 TypeScript hashes agree including UTF16 and max safe integer');
select * from finish(); rollback;`);
