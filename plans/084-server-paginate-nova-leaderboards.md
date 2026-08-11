# Plan 084: Server-Paginate Nova Leaderboards

> **Executor instructions:** Characterize ranking semantics first, then add one
> database-backed paginated contract that includes zero-score participants and
> preserves top-three, totals, and current-rank behavior.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/nova/src/app/[locale]/(dashboard)/(leaderboard)/leaderboard/page.tsx' 'apps/nova/src/app/[locale]/(dashboard)/(leaderboard)/leaderboard/teams/page.tsx' apps/nova/src/lib/leaderboard apps/database/supabase/migrations apps/database/supabase/tests/private-schema-nova-runtime.sql packages/types/src/supabase.ts`
> Stop on ranking, filtering, view, or page-contract drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** Performance / test coverage
- **Depends on:** generated database type and migration ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Both leaderboard pages load, enrich, sort, and rank every participant before
slicing 20 visible rows. Team rendering additionally loads membership/profile
data for the whole competition. Cost therefore grows with all participants,
not the requested page, and sensitive tie/rank behavior has no app-level tests.

## Current state

- The user page materializes the full leaderboard and enabled-user set.
- The team page materializes every team membership, referenced user, and score.
- Both sort/rank in page loaders, then slice the requested 20 rows.
- Existing database tests cover isolated scores, not ties, pagination, top
  three, zero scores, filters, or current rank.
- Existing views omit enabled zero-score users from the ranked relation. A
  complete bounded contract therefore requires database work and generated
  types whose artifacts currently have active owners.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Do not execute until migration and generated
type owners release or transfer their exact paths.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Create migration | `bun sb:new paginate_nova_leaderboards` | one additive migration is created |
| Apply locally | `bun sb:up` | the new functions apply without error |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | pagination, zero-score, ordering, and actor cases pass |
| Type generation | `bun sb:typegen` | generated RPC types are current |
| Focused tests | `bun --cwd apps/nova vitest run src/lib/leaderboard/loader.test.ts` | user/team ranking and bounded-query cases pass |
| Nova types | `bun run --cwd apps/nova type-check` | exit 0 |
| Nova build | `bun run --cwd apps/nova build` | exit 0 |
| Repository gate | `bun check` | exit 0, or only a documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- both Nova leaderboard page files named in the drift check
- `apps/nova/src/lib/leaderboard/loader.ts` and focused test (create)
- small pure ranking/response types or helpers under the same directory
- one additive migration plus `apps/database/supabase/tests/private-schema-nova-runtime.sql`
- generated database types after successful local apply
- `plans/README.md` only for status

Do not modify scoring formulas, challenge semantics, navigation, or visual design.

## Git workflow

Use branch `perf/paginate-nova-leaderboards` in an isolated worktree and run
`bun setup`. Commit `perf(nova): paginate leaderboard queries`. Claim the
commit window before staging; do not push unless instructed.

## Steps

### Step 1: Extract and characterize the current contract

Create an injectable server loader and pure mapping helpers. Fixtures must cover
equal scores crossing a page boundary, zero-score users and teams, challenge
filters, page 1 and later pages, top three, current actor/team rank, invalid
page input, total count, and has-more behavior. Preserve ordinal ranks: equal
scores do not share a rank. Make ordering deterministic as `score DESC`, then
normalized display name ascending, then stable ID ascending; characterize and
approve this tie-break as the only intentional output change.

### Step 2: Bound the user query

Add `private.get_nova_user_leaderboard_page` and
`private.get_nova_team_leaderboard_page` as service-role-only functions: revoke
execution from `PUBLIC`, `anon`, and `authenticated`, and grant only the trusted
service role. The Nova server loader must first obtain the actor through
`requireNovaAppSessionUser()`, then pass that verified ID as `p_actor_id` through
an injectable admin-backed wrapper. No request/query parameter may supply or
override it. Each function validates the actor's Nova eligibility and any
challenge scope before reading data, unions ranked rows with eligible zero-score
participants, and only then applies the explicit order and bounded range.
Accept `p_limit` (fixed by the caller to 20), `p_offset`, the verified
`p_actor_id`, and the existing optional challenge identifier.

Return and Zod-validate exactly:

```ts
{
  rows: ExistingLeaderboardRow[];
  total: number;
  topThree: ExistingLeaderboardRow[];
  currentRank: number | null;
  page: number;
  pageSize: 20;
  hasMore: boolean;
}
```

Preserve the existing user/team row fields. Do not recreate an all-user
fallback in JavaScript.

### Step 3: Bound team enrichment

Page/rank teams first, then load memberships and profiles only for IDs needed by
the visible page and top three. Deduplicate overlaps and preserve current avatar
ordering.

### Step 4: Prove query shape and compatibility

Use an injectable query double to assert bounded ranges and ID-scoped member
loads even with large synthetic cardinality. pgTAP must prove `PUBLIC`, `anon`,
and `authenticated` cannot execute either function and that a nonexistent or
ineligible verified actor is rejected. App tests must prove cookie-only auth is
not substituted for the Nova app session and the request cannot override
`p_actor_id`. Run tests, typecheck, the real Nova build, `bun check`, and
whitespace validation.

## Done criteria

- [ ] Visible page work is bounded independently of total participants.
- [ ] Team enrichment is limited to visible/top-three team IDs.
- [ ] Ordinal tie, top-three, zero-score, total, current-rank, and paging behavior is deterministic and covered.
- [ ] Only the trusted service role can execute the RPCs, using the verified Nova app-session actor.
- [ ] Focused tests, types, build, repository, and whitespace gates pass.

## STOP conditions

Stop if ownership remains active, the explicit ordinal tie-break is rejected,
the server cannot prove the app-session actor before invoking the service-only
RPC, any untrusted role can execute the function, or a required gate fails twice.

## Maintenance notes

Never optimize ranking by changing its semantics implicitly. Characterization
is the prerequisite for moving work to the database boundary.
