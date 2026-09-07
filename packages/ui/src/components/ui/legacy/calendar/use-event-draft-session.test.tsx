import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useEventDraftSession } from './use-event-draft-session';

describe('calendar draft session', () => {
  it('preserves typed content through background refreshes and initializes on reopening or switching events', () => {
    const { result, rerender } = renderHook(
      ({ open, eventId, workspaceId, title }) => {
        const [draft, setDraft] = useState('');
        useEventDraftSession({
          isOpen: open,
          eventId,
          workspaceId,
          initialize: () => setDraft(title),
        });
        return { draft, setDraft };
      },
      {
        initialProps: {
          open: true,
          eventId: 'new',
          workspaceId: 'ws-1',
          title: '',
        },
      }
    );
    act(() => result.current.setDraft('Unsaved meeting details'));
    rerender({
      open: true,
      eventId: 'new',
      workspaceId: 'ws-1',
      title: 'Refetched server state',
    });
    expect(result.current.draft).toBe('Unsaved meeting details');
    rerender({ open: false, eventId: 'new', workspaceId: 'ws-1', title: '' });
    rerender({
      open: true,
      eventId: 'new',
      workspaceId: 'ws-1',
      title: 'Next draft',
    });
    expect(result.current.draft).toBe('Next draft');
    rerender({
      open: true,
      eventId: 'event-2',
      workspaceId: 'ws-1',
      title: 'Existing meeting',
    });
    expect(result.current.draft).toBe('Existing meeting');
    rerender({
      open: true,
      eventId: 'event-2',
      workspaceId: 'ws-2',
      title: 'Other workspace',
    });
    expect(result.current.draft).toBe('Other workspace');
  });
});
