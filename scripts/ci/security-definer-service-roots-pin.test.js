const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { verifyRemediation } = require('./security-definer-guard');

test('the object_access service-roots pin exempts only that exact file and no other later migration', (t) => {
  const {
    storageAclReviewedLater,
    withoutReviewedLater,
  } = require('./security-definer-blocks');
  const entry = require('./security-definer-verified-findings.json').find(
    (record) => record.remediationMode === 'acl-only'
  );
  const root = path.resolve(__dirname, '../..');
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const pinFile =
    'apps/database/supabase/migrations/20261125085300_workspace_storage_service_roots.sql';
  const pins = storageAclReviewedLater.filter((pin) => pin.file === pinFile);
  assert.equal(pins.length, 1);
  if (!fs.existsSync(path.join(root, pinFile))) {
    t.diagnostic(`${pinFile} is not in this checkout yet`);
    return;
  }
  const source = read(pinFile);
  const remediation = read(entry.remediationMigration);
  const proof = { original: read(entry.file), entry, intervening: [] };
  const verify = (later) =>
    verifyRemediation(remediation, {
      ...proof,
      later: withoutReviewedLater(later),
    });
  const signature =
    'workspace_storage.object_access(text, text, workspace_storage.actor_access)';

  // The exact file stays exempt.
  assert.equal(verify([source]), true);
  assert.deepEqual(withoutReviewedLater([source]), []);

  // Any other later migration that redefines or re-grants the helper still
  // re-surfaces the 181200 finding.
  const variants = {
    edited: source + '\n-- edited',
    whitespace: source.replace('begin;', 'begin; '),
    withoutFinalAcl:
      source.slice(0, source.indexOf('-- create or replace keeps')) +
      '\ncommit;\n',
    regrantPublic:
      source.replace(/\ncommit;\n$/, '') +
      `\ngrant execute on function ${signature} to public;\ncommit;\n`,
    regrantAnon:
      source.replace(/\ncommit;\n$/, '') +
      `\ngrant execute on function ${signature} to anon;\ncommit;\n`,
    crlf: source.replace(/\n/g, '\r\n'),
    bom: '\ufeff' + source,
    grantPublicOnly: `grant execute on function ${signature} to public;\n`,
    grantAnonOnly: `grant execute on function ${signature} to anon;\n`,
    allowAll: `begin;\ncreate or replace function ${signature.replace('(text, text, workspace_storage.actor_access)', '(p_name text, p_operation text, p_actor workspace_storage.actor_access)')} returns boolean language sql security definer set search_path = pg_catalog, pg_temp as $$ select true $$;\ncommit;\n`,
  };
  for (const [name, variant] of Object.entries(variants)) {
    assert.notEqual(variant, source, name);
    assert.deepEqual(withoutReviewedLater([variant]), [variant], name);
    assert.equal(verify([variant]), false, name);
    assert.equal(verify([source, variant]), false, name);
  }
});
