const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot } = require('./workflow-config-test-helpers.js');

test('fork package smoke builds use a secretless compatibility path', () => {
  const workflow = fs.readFileSync(
    path.join(
      repoRoot,
      '.github',
      'workflows',
      'external-internal-packages.yaml'
    ),
    'utf8'
  );

  assert.match(
    workflow,
    /IS_FORK_PULL_REQUEST:\s*\$\{\{\s*github\.event_name\s*==\s*'pull_request'\s*&&\s*github\.event\.pull_request\.head\.repo\.full_name\s*!=\s*github\.repository\s*\}\}/
  );
  assert.match(workflow, /permissions:\n {2}contents: read/);
  assert.match(
    workflow,
    /- name: Build Project Artifacts \(Fork\)\n {8}if: env\.IS_FORK_PULL_REQUEST == 'true'/
  );
  assert.match(
    workflow,
    /NEXT_PUBLIC_SUPABASE_URL: http:\/\/127\.0\.0\.1:54321/
  );
  assert.equal(
    (workflow.match(/if: env\.IS_FORK_PULL_REQUEST != 'true'/g) ?? []).length,
    3,
    'secret-backed setup and build steps must remain trusted-only'
  );
});
