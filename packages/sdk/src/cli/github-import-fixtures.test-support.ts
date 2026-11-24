import { normalizeGithubIssue } from './github-import-source';

export const node = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  url: `https://github.com/tutur3u/platform/issues/${number}`,
  title: `Issue ${number}`,
  body: 'body',
  state: 'CLOSED',
  stateReason: 'COMPLETED',
  createdAt: `2023-05-${String((number % 27) + 1).padStart(2, '0')}T00:00:00Z`,
  closedAt: '2023-06-01T00:00:00Z',
  author: { login: 'octocat' },
  labels: { nodes: [{ name: 'bug' }] },
  assignees: { nodes: [{ login: 'vhpx' }] },
  milestone: { title: 'v0.12' },
  parent: null,
  subIssues: { nodes: [] },
  comments: {
    nodes: [
      {
        url: `https://github.com/tutur3u/platform/issues/${number}#c1`,
        author: null,
        body: 'hi',
        createdAt: '2023-05-02T00:00:00Z',
      },
    ],
  },
  closedByPullRequestsReferences: {
    nodes: [
      {
        url: 'https://github.com/tutur3u/platform/pull/9',
        number: 9,
        state: 'MERGED',
        merged: true,
        title: 'Fix',
      },
    ],
  },
  timelineItems: {
    nodes: [
      {
        __typename: 'LabeledEvent',
        createdAt: '2023-05-01T00:00:00Z',
        label: { name: 'bug' },
        actor: { login: 'vhpx' },
      },
      {
        __typename: 'ClosedEvent',
        createdAt: '2023-06-01T00:00:00Z',
        actor: { login: 'vhpx' },
        closer: null,
      },
      {
        __typename: 'ReferencedEvent',
        createdAt: '2023-06-02T00:00:00Z',
        commit: {
          oid: 'abc1234',
          url: 'https://github.com/tutur3u/platform/commit/abc1234',
        },
      },
      {
        __typename: 'CrossReferencedEvent',
        createdAt: '2023-06-03T00:00:00Z',
        source: {
          __typename: 'PullRequest',
          number: 10,
          url: 'https://github.com/tutur3u/platform/pull/10',
          state: 'OPEN',
          merged: false,
          title: 'Other',
        },
      },
      {
        __typename: 'CrossReferencedEvent',
        createdAt: '2023-06-03T00:00:00Z',
        source: {
          __typename: 'Issue',
          number: 11,
          url: 'https://github.com/tutur3u/platform/issues/11',
        },
      },
    ],
  },
  ...extra,
});

export const norm = (number: number, extra: Record<string, unknown> = {}) =>
  normalizeGithubIssue(node(number, extra), 'tutur3u/platform');
