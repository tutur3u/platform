import { describe, expect, it } from 'vitest';
import { FLEET_LISTS } from './fake-store.test-support';
import { issue } from './fixtures.test-support';
import {
  importTaskName,
  issueTaskState,
  planLabels,
  planLinks,
  planPeople,
  refStateReason,
  resolveIssueList,
  taskFieldsForList,
  timestampOrNull,
} from './plan';

describe('importTaskName', () => {
  it('appends the issue number and nothing else', () => {
    expect(importTaskName('Fix the thing', 42)).toBe('Fix the thing #42');
    expect(importTaskName('  spaced \n out  ', 7)).toBe('spaced out #7');
    expect(importTaskName('Fix the thing', 42)).not.toMatch(/\[L-/);
  });

  it('cuts the title, never the number, when too long', () => {
    const name = importTaskName('x'.repeat(2000), 12345);
    expect(name).toHaveLength(1024);
    expect(name.endsWith(' #12345')).toBe(true);
  });
});

describe('issueTaskState', () => {
  it('keeps the close reason', () => {
    expect(issueTaskState(issue({ number: 1 }))).toBe('open');
    expect(
      issueTaskState(
        issue({ number: 1, state: 'closed', state_reason: 'completed' })
      )
    ).toBe('completed');
    expect(
      issueTaskState(issue({ number: 1, state: 'closed', state_reason: null }))
    ).toBe('completed');
    expect(
      issueTaskState(
        issue({ number: 1, state: 'closed', state_reason: 'not_planned' })
      )
    ).toBe('not_planned');
    expect(
      issueTaskState(
        issue({ number: 1, state: 'closed', state_reason: 'duplicate' })
      )
    ).toBe('not_planned');
  });
});

describe('resolveIssueList', () => {
  const none = { default_done_list_id: null, default_closed_list_id: null };
  const mapping = {
    open_list_id: null,
    completed_list_id: null,
    not_planned_list_id: null,
  };

  it('falls back to the board lists: completed to done, not planned to closed', () => {
    expect(resolveIssueList('open', mapping, FLEET_LISTS, none)?.id).toBe(
      'l-queued'
    );
    expect(resolveIssueList('completed', mapping, FLEET_LISTS, none)?.id).toBe(
      'l-done'
    );
    expect(
      resolveIssueList('not_planned', mapping, FLEET_LISTS, none)?.id
    ).toBe('l-closed');
  });

  it('prefers a mapped list that exists on the board', () => {
    expect(
      resolveIssueList(
        'open',
        { ...mapping, open_list_id: 'l-live' },
        FLEET_LISTS,
        none
      )?.id
    ).toBe('l-live');
    expect(
      resolveIssueList(
        'open',
        { ...mapping, open_list_id: 'elsewhere' },
        FLEET_LISTS,
        none
      )?.id
    ).toBe('l-queued');
  });
});

describe('taskFieldsForList', () => {
  const closedAt = '2023-05-02T07:00:00.000Z';
  it('sets completion on done lists and closure on closed lists', () => {
    expect(
      taskFieldsForList({ status: 'done' }, { closed_at: closedAt })
    ).toEqual({ completed: true, completed_at: closedAt, closed_at: null });
    expect(
      taskFieldsForList({ status: 'closed' }, { closed_at: closedAt })
    ).toEqual({ completed: false, completed_at: null, closed_at: closedAt });
    expect(
      taskFieldsForList({ status: 'not_started' }, { closed_at: null })
    ).toEqual({ completed: false, completed_at: null, closed_at: null });
  });
});

describe('planLabels', () => {
  it('maps ids, priority and ignores, keeping unmapped labels aside', () => {
    const plan = planLabels(
      ['bug', 'urgent', 'security', 'wontfix', 'nova', 'bug'],
      {
        bug: 'label-bug',
        urgent: 'priority:high',
        security: 'priority:critical',
        wontfix: 'ignore',
      }
    );
    expect(plan).toEqual({
      labelIds: ['label-bug'],
      priority: 'critical',
      unmapped: ['nova'],
    });
  });

  it('takes the highest priority label', () => {
    expect(
      planLabels(['a', 'b'], { a: 'priority:critical', b: 'priority:high' })
        .priority
    ).toBe('critical');
    expect(planLabels(['a'], { a: 'priority:high' }).priority).toBe('high');
    expect(planLabels([], {}).priority).toBeNull();
  });
});

describe('planPeople', () => {
  it('resolves only mapped workspace members and never invents users', () => {
    const plan = planPeople(
      ['vhpx', 'stranger', 'left-the-team'],
      { vhpx: 'u1', 'left-the-team': 'u9' },
      new Set(['u1'])
    );
    expect(plan).toEqual({
      userIds: ['u1'],
      unmapped: ['stranger', 'left-the-team'],
    });
  });
});

describe('planLinks and helpers', () => {
  it('turns linked PRs and commits into typed links', () => {
    const specs = planLinks(
      issue({
        number: 1,
        linked_prs: [
          {
            url: 'https://github.com/tutur3u/platform/pull/9',
            number: 9,
            state: 'CLOSED',
            merged: true,
            title: 'Fix',
          },
          {
            url: 'https://github.com/tutur3u/platform/pull/10',
            number: 10,
            state: 'OPEN',
            merged: false,
          },
        ],
        linked_commits: [
          {
            url: 'https://github.com/tutur3u/platform/commit/abcdef1',
            oid: 'abcdef1',
          },
        ],
      })
    );
    expect(specs.map((s) => [s.kind, s.state, s.externalId])).toEqual([
      ['pull_request', 'merged', 'tutur3u/platform#9'],
      ['pull_request', 'open', 'tutur3u/platform#10'],
      ['commit', null, 'tutur3u/platform@abcdef1'],
    ]);
  });

  it('normalizes timestamps and reasons', () => {
    expect(timestampOrNull('2023-05-01T07:00:00Z')).toBe(
      '2023-05-01T07:00:00.000Z'
    );
    expect(timestampOrNull('garbage')).toBeNull();
    expect(timestampOrNull(null)).toBeNull();
    expect(
      refStateReason(
        issue({ number: 1, state: 'closed', state_reason: 'NOT_PLANNED' })
      )
    ).toBe('not_planned');
    expect(
      refStateReason(issue({ number: 1, state_reason: 'weird' }))
    ).toBeNull();
  });
});
