const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const overviewPath = path.join(
  __dirname,
  '..',
  'apps',
  'docs',
  'platform',
  'overview.mdx'
);
const overview = fs.readFileSync(overviewPath, 'utf8');

function getSection(markdown, heading) {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);

  assert.notEqual(start, -1, `Missing documentation section: ${marker}`);

  const nextSection = markdown.indexOf('\n## ', start + marker.length);
  return markdown.slice(start, nextSection === -1 ? undefined : nextSection);
}

const ownershipSection = getSection(
  overview,
  'Satellite Apps And Central API Ownership'
);

test('satellite API ownership section rejects stale absolute claims', () => {
  const staleClaims = [
    /every satellite routes/iu,
    /none owns its own backend/iu,
    /owns only its UI/iu,
    /single source of truth for API routes/iu,
  ];

  for (const staleClaim of staleClaims) {
    assert.doesNotMatch(ownershipSection, staleClaim);
  }
});

test('satellite API ownership section documents the current routing model', () => {
  assert.match(
    ownershipSection,
    /satellites may own their product APIs locally/iu
  );
  assert.match(
    ownershipSection,
    /unmatched or explicitly central route families can fall back to the live\s+`apps\/web` platform/iu
  );
  assert.match(
    ownershipSection,
    /`apps\/web` remains authoritative only where a route family\s+has not been hard-cut over/iu
  );
  assert.match(
    ownershipSection,
    /\[satellite app ownership guide\]\(\/platform\/architecture\/satellite-apps\)/u
  );
  assert.match(
    ownershipSection,
    /\[TanStack and Rust migration guide\]\(\/platform\/architecture\/tanstack-rust-migration\)/u
  );
});
