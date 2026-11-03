import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import { test } from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(
      specifier.startsWith('.') && !extname(specifier)
        ? `${specifier}.ts`
        : specifier,
      context
    );
  },
});
const {
  isTutoringGroupExcluded,
  readTutoringPolicy,
  STANDARD_TUTORING_POLICY,
} = await import('../packages/internal-api/src/tutoring-policy.ts');
const { loadCurrentLearnerMemberships, loadGroupTagNames } = await import(
  '../apps/web/src/app/api/v1/workspaces/[wsId]/tutoring/queue/queue-membership.ts'
);

const fixtures = JSON.parse(
  readFileSync(
    new URL(
      '../packages/internal-api/src/__fixtures__/tutoring-queue-parity.json',
      import.meta.url
    ),
    'utf8'
  )
);
for (const fixture of fixtures) {
  test(fixture.name, async () => {
    const filters = [];
    const rows = fixture.current
      ? [
          {
            group_id: 'class',
            user_id: 'learner',
            role: fixture.role,
            user: { archived: fixture.archived },
          },
        ]
      : [];
    const client = {
      from(table) {
        let from = 0;
        let to = 999;
        const query = {
          select() {
            return query;
          },
          eq(...args) {
            filters.push(args);
            return query;
          },
          or(value) {
            filters.push(value);
            return query;
          },
          order() {
            return query;
          },
          range(start, end) {
            from = start;
            to = end;
            return query;
          },
          // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
          then(resolve, reject) {
            const data =
              table === 'workspace_user_groups_users'
                ? rows.filter(
                    (row) => row.role !== 'TEACHER' && !row.user.archived
                  )
                : fixture.tags.map((name) => ({
                    group_id: 'class',
                    tag: { name },
                  }));
            return Promise.resolve({
              data: data.slice(from, to + 1),
              error: null,
            }).then(resolve, reject);
          },
        };
        return query;
      },
    };
    const policy = readTutoringPolicy(
      JSON.stringify({
        ...STANDARD_TUTORING_POLICY,
        preset: fixture.preset,
        groupExclusions: fixture.rules,
      })
    );
    const members = await loadCurrentLearnerMemberships({
      sbAdmin: client,
      wsId: 'fixture-workspace',
    });
    assert.equal(members.error, null);
    assert.ok(
      filters.some(
        (value) =>
          Array.isArray(value) &&
          value[0] === 'group.ws_id' &&
          value[1] === 'fixture-workspace'
      )
    );
    assert.ok(
      filters.some(
        (value) =>
          Array.isArray(value) &&
          value[0] === 'user.archived' &&
          value[1] === false
      )
    );
    assert.ok(filters.includes('role.is.null,role.neq.TEACHER'));
    const tags = await loadGroupTagNames({
      sbAdmin: client,
      wsId: 'fixture-workspace',
    });
    assert.equal(tags.error, null);
    const currentKeys = new Set(
      members.data.map((row) => `${row.group_id}:${row.user_id}`)
    );
    const absent =
      fixture.absence &&
      !isTutoringGroupExcluded(
        policy,
        fixture.groupName,
        'make_up',
        'class',
        tags.data.get('class')
      );
    const weak =
      fixture.feedback &&
      !isTutoringGroupExcluded(
        policy,
        fixture.groupName,
        'weak_support',
        'class',
        tags.data.get('class')
      );
    const reason =
      currentKeys.has('class:learner') && (absent || weak)
        ? absent
          ? weak
            ? 'BOTH'
            : 'ABSENT_RECOVERY'
          : 'WEAK_SUPPORT'
        : null;
    assert.equal(reason, fixture.expected);
  });
}
