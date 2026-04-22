const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  findViolations,
  hasCallerMembershipCheck,
  hasMemberTypeEnforcement,
} = require('./check-workspace-member-type-guard.js');

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-member-guard-'));
}

function writeFile(root, relativePath, content) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test('detects caller membership checks', () => {
  const source = `
    const { data } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();
  `;

  assert.equal(hasCallerMembershipCheck(source), true);
});

test('detects centralized MEMBER enforcement helper', () => {
  const source = `
    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });
  `;

  assert.equal(hasMemberTypeEnforcement(source), true);
});

test('findViolations flags files that miss MEMBER enforcement', () => {
  const root = createTempRepo();

  writeFile(
    root,
    'apps/web/src/app/api/v1/workspaces/[wsId]/unsafe/route.ts',
    `
      export async function GET() {
        const { data } = await supabase
          .from('workspace_members')
          .select('user_id')
          .eq('ws_id', wsId)
          .eq('user_id', user.id)
          .maybeSingle();

        return data;
      }
    `
  );

  const violations = findViolations(root);
  assert.deepEqual(violations, [
    path.join(
      'apps',
      'web',
      'src',
      'app',
      'api',
      'v1',
      'workspaces',
      '[wsId]',
      'unsafe',
      'route.ts'
    ),
  ]);
});

test('findViolations ignores files that already enforce MEMBER type', () => {
  const root = createTempRepo();

  writeFile(
    root,
    'packages/apis/src/safe/route.ts',
    `
      export async function GET() {
        const membership = await verifyWorkspaceMembershipType({
          wsId,
          userId: user.id,
          supabase,
        });

        if (!membership.ok) return null;
        return membership;
      }
    `
  );

  const violations = findViolations(root);
  assert.deepEqual(violations, []);
});
