/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { timelineEventToEntry } from './activity-entries';
import { getCollaborationEntry, TimelineCommentBody } from './timeline-entries';
import type { TaskTimelineEvent } from './types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const t = (key: string, values?: Record<string, string>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;

function event(overrides: Partial<TaskTimelineEvent>): TaskTimelineEvent {
  return {
    id: 'e1',
    type: 'comment_added',
    at: '2026-11-24T00:00:00.000Z',
    actor: null,
    external_actor: null,
    field_name: null,
    old_value: null,
    new_value: null,
    metadata: {},
    ...overrides,
  };
}

const describeType = (overrides: Partial<TaskTimelineEvent>) =>
  getCollaborationEntry(timelineEventToEntry('task', event(overrides)), t);

describe('collaboration timeline entries', () => {
  it('describes comment events', () => {
    expect(describeType({ type: 'comment_added' })?.action).toBe(
      'timeline.comment_added'
    );
    expect(describeType({ type: 'comment_updated' })?.action).toBe(
      'timeline.comment_updated'
    );
    expect(describeType({ type: 'comment_deleted' })?.action).toBe(
      'timeline.comment_deleted'
    );
  });

  it('describes link events with the link label', () => {
    const added = describeType({
      type: 'link_added',
      metadata: { title: 'Fix the thing', kind: 'pull_request' },
    });
    render(<>{added?.details}</>);
    expect(added?.action).toBe('timeline.link_added');
    expect(screen.getByText('Fix the thing')).toBeInTheDocument();

    const removed = describeType({
      type: 'link_removed',
      metadata: { url: 'https://github.com/o/r/pull/7' },
    });
    expect(removed?.action).toBe('timeline.link_removed');
  });

  it('falls back to the external id then the url for link labels', () => {
    const byId = describeType({
      type: 'link_added',
      metadata: { external_id: '42' },
    });
    const { container } = render(<>{byId?.details}</>);
    expect(container).toHaveTextContent('#42');
  });

  it('describes an import with the original issue number', () => {
    const imported = describeType({
      type: 'external_imported',
      metadata: { number: 1234, url: 'https://github.com/o/r/issues/1234' },
    });
    const { container } = render(<>{imported?.details}</>);
    expect(imported?.action).toBe('timeline.external_imported');
    expect(container).toHaveTextContent('github #1234');
  });

  it('describes external closed, reopened and unknown events', () => {
    expect(
      describeType({ type: 'external_event', metadata: { event: 'closed' } })
        ?.action
    ).toBe('timeline.external_closed');
    expect(
      describeType({ type: 'external_event', new_value: 'reopened' })?.action
    ).toBe('timeline.external_reopened');
    expect(describeType({ type: 'external_event' })?.action).toBe(
      'timeline.external_event'
    );
  });

  it('leaves non-collaboration change types to the activity section', () => {
    expect(describeType({ type: 'field_updated' })).toBeNull();
    expect(describeType({ type: 'task_created' })).toBeNull();
  });

  it('shows the GitHub login for external actors', () => {
    expect(
      timelineEventToEntry('task', event({ external_actor: 'octocat' }))
        .external_actor
    ).toBe('octocat');
    expect(
      timelineEventToEntry(
        'task',
        event({ metadata: { external_author: 'hubot' } })
      ).external_actor
    ).toBe('hubot');
  });

  it('prefers a native actor over any external login', () => {
    const entry = timelineEventToEntry(
      'task',
      event({
        actor: { id: 'u1', display_name: 'Ada', avatar_url: null },
        metadata: { external_author: 'hubot' },
      })
    );
    expect(entry.user?.name).toBe('Ada');
    expect(entry.external_actor).toBeNull();
  });

  it('renders the markdown comment body only under comment_added', () => {
    const comment = {
      id: 'c1',
      task_id: 'task',
      author: null,
      external_author: 'octocat',
      external_url: null,
      body: 'Looks **good**',
      created_at: '2026-11-24T00:00:00.000Z',
      edited_at: null,
    };
    const added = timelineEventToEntry(
      'task',
      event({ type: 'comment_added', comment })
    );
    const { container, rerender } = render(
      <TimelineCommentBody entry={added} />
    );
    expect(container.querySelector('strong')).toHaveTextContent('good');

    const updated = timelineEventToEntry(
      'task',
      event({ type: 'comment_updated', comment })
    );
    rerender(<TimelineCommentBody entry={updated} />);
    expect(container).toBeEmptyDOMElement();
  });
});
