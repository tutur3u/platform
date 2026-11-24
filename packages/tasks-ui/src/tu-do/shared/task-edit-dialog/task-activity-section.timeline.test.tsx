/**
 * @vitest-environment jsdom
 */

import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './collaboration/api';
import { echoTranslator, renderWithQuery } from './collaboration/test-utils';
import type { TaskTimelineEvent } from './collaboration/types';
import { TaskActivitySection } from './task-activity-section';

vi.mock('next-intl', () => ({
  useTranslations: () => echoTranslator,
  useLocale: () => 'en',
}));
vi.mock('./collaboration/api');

const base = {
  actor: null,
  external_actor: null,
  field_name: null,
  old_value: null,
  new_value: null,
  metadata: {},
};

const ada = { id: 'u1', display_name: 'Ada Lovelace', avatar_url: null };

const events: TaskTimelineEvent[] = [
  {
    ...base,
    id: 'e1',
    type: 'comment_added',
    at: '2026-11-24T09:00:00.000Z',
    actor: ada,
    comment: {
      id: 'c1',
      task_id: 't1',
      author: ada,
      external_author: null,
      external_url: null,
      body: 'Native **comment** body',
      created_at: '2026-11-24T09:00:00.000Z',
      edited_at: null,
    },
  },
  {
    ...base,
    id: 'e2',
    type: 'comment_added',
    at: '2026-11-23T09:00:00.000Z',
    metadata: { external_author: 'octocat' },
    comment: {
      id: 'c2',
      task_id: 't1',
      author: null,
      external_author: 'octocat',
      external_url: 'https://github.com/o/r/issues/1#issuecomment-1',
      body: 'Imported body',
      created_at: '2026-11-23T09:00:00.000Z',
      edited_at: null,
    },
  },
  {
    ...base,
    id: 'e3',
    type: 'comment_updated',
    at: '2026-11-22T09:00:00.000Z',
    actor: ada,
  },
  {
    ...base,
    id: 'e4',
    type: 'comment_deleted',
    at: '2026-11-21T09:00:00.000Z',
    actor: ada,
  },
  {
    ...base,
    id: 'e5',
    type: 'link_added',
    at: '2026-11-20T09:00:00.000Z',
    actor: ada,
    metadata: { kind: 'pull_request', title: 'Add comments' },
  },
  {
    ...base,
    id: 'e6',
    type: 'link_removed',
    at: '2026-11-19T09:00:00.000Z',
    actor: ada,
    metadata: { url: 'https://github.com/o/r/pull/8' },
  },
  {
    ...base,
    id: 'e7',
    type: 'external_imported',
    at: '2026-11-18T09:00:00.000Z',
    actor: ada,
    metadata: { number: 1234, url: 'https://github.com/o/r/issues/1234' },
  },
  {
    ...base,
    id: 'e8',
    type: 'external_event',
    at: '2026-03-01T09:00:00.000Z',
    external_actor: 'hubot',
    metadata: { event: 'closed' },
  },
  {
    ...base,
    id: 'e9',
    type: 'task_created',
    at: '2026-03-01T08:00:00.000Z',
    actor: ada,
  },
];

describe('TaskActivitySection timeline', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.listTaskTimeline).mockResolvedValue({
      events,
      nextCursor: null,
    });
  });

  it('renders every collaboration change type and keeps existing ones', async () => {
    renderWithQuery(
      <TaskActivitySection embedded initialLimit={20} taskId="t1" wsId="ws" />
    );

    expect(await screen.findAllByText('timeline.comment_added')).toHaveLength(
      2
    );
    for (const text of [
      'timeline.comment_updated',
      'timeline.comment_deleted',
      'timeline.link_added',
      'timeline.link_removed',
      'timeline.external_imported',
      'timeline.external_closed',
      'created_task',
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText('Add comments')).toBeInTheDocument();
    expect(screen.getByText('github #1234')).toBeInTheDocument();
    expect(api.listTaskTimeline).toHaveBeenCalledWith('ws', 't1', {
      limit: 50,
    });
  });

  it('interleaves comment bodies under their events', async () => {
    const { container } = renderWithQuery(
      <TaskActivitySection embedded initialLimit={20} taskId="t1" wsId="ws" />
    );

    await screen.findByText('Imported body');
    expect(screen.getByText('comment').tagName).toBe('STRONG');
    const text = container.textContent ?? '';
    expect(text.indexOf('Native')).toBeLessThan(text.indexOf('Imported body'));
  });

  it('shows external actors as their GitHub login', async () => {
    renderWithQuery(
      <TaskActivitySection embedded initialLimit={20} taskId="t1" wsId="ws" />
    );

    await screen.findByText('Imported body');
    expect(screen.getByText('octocat')).toBeInTheDocument();
    expect(screen.getByText('hubot')).toBeInTheDocument();
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
  });
});
