import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertConnectedMailTypesMatch,
  connectedMailTables,
} from './connected-mail-types-drift.mjs';

function schema({ column = 'string | null', relationship = 'accounts' } = {}) {
  const tables = connectedMailTables.map(
    (name) => `${name}: {
      Row: { id: string; expires_at: ${column}; };
      Insert: { id?: string; expires_at?: ${column}; };
      Update: { expires_at?: ${column}; };
      Relationships: [{ referencedRelation: '${relationship}'; columns: ['id']; }];
    };`
  );
  return `export type Database = { private: { Tables: { ${tables.join('')} }; }; };`;
}
test('ignores only presentation differences in the three owned table types', () => {
  const committed = schema();
  const generated = committed.replaceAll(';', '\n').replaceAll("'", '"');
  assert.equal(assertConnectedMailTypesMatch(committed, generated).matched, 3);
});
test('rejects changed row nullability', () => {
  assert.throws(
    () => assertConnectedMailTypesMatch(schema(), schema({ column: 'string' })),
    /Private Connected Mail type drift/u
  );
});
test('rejects changed insert optionality', () => {
  assert.throws(
    () =>
      assertConnectedMailTypesMatch(schema(), schema().replace('id?:', 'id:')),
    /Private Connected Mail type drift/u
  );
});
test('rejects changed relationship contracts', () => {
  assert.throws(
    () =>
      assertConnectedMailTypesMatch(
        schema(),
        schema({ relationship: 'other' })
      ),
    /Private Connected Mail type drift/u
  );
});
test('rejects a missing owned table', () => {
  assert.throws(
    () =>
      assertConnectedMailTypesMatch(
        schema(),
        schema().replace('mail_oauth_requests', 'other')
      ),
    /Missing or duplicated schema member/u
  );
});
test('rejects duplicate table members', () => {
  const generated = schema().replace(
    'Tables: {',
    'Tables: { mail_connected_accounts: {};'
  );
  assert.throws(
    () => assertConnectedMailTypesMatch(schema(), generated),
    /Missing or duplicated schema member/u
  );
});
test('rejects malformed generated schema types', () => {
  assert.throws(
    () => assertConnectedMailTypesMatch(schema(), schema().slice(0, -3)),
    /not valid TypeScript/u
  );
});
test('does not claim unrelated schema drift qualification', () => {
  const generated = schema().replace(
    'private:',
    'public: { unrelated: string }; private:'
  );
  assert.equal(assertConnectedMailTypesMatch(schema(), generated).matched, 3);
});
