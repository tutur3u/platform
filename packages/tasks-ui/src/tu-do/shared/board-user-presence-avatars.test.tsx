import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RealtimePresenceState } from '@tuturuuu/internal-api/realtime';
import type { UserPresenceState } from '@tuturuuu/tasks-ui/hooks/usePresence';
import type { ComponentProps, ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BOARD_FILTERS } from './board-header/board-filter-state';
import {
  BoardUserPresenceAvatars,
  BoardUserPresenceAvatarsComponent,
} from './board-user-presence-avatars';
import type { BoardFiltersMetadata } from './task-filter.types';

const presence = vi.hoisted(() => ({
  metadata: undefined as BoardFiltersMetadata | undefined,
}));

vi.mock('@tuturuuu/tasks-ui/hooks/useBoardPresence', () => ({
  useBoardPresence: () => ({
    currentUserId: 'me',
    getBoardViewers: () => [
      {
        user: { id: 'viewer', display_name: 'Minh' },
        metadata: presence.metadata,
      },
    ],
  }),
}));
vi.mock('../providers/workspace-presence-provider', () => ({
  useOptionalWorkspacePresenceContext: () => null,
}));
vi.mock('../hooks/useTaskDialog', () => ({
  useTaskDialog: () => ({ openTaskById: vi.fn() }),
}));
vi.mock('../providers/task-dialog-provider', () => ({
  useTaskDialogContext: () => ({ state: { isOpen: false } }),
}));
// Expose the real presence action without depending on popover geometry.
vi.mock('@tuturuuu/ui/popover', () => ({
  Popover: ({ children }: ComponentProps<'div'>) => <div>{children}</div>,
  PopoverContent: ({ children }: ComponentProps<'div'>) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: ComponentProps<'div'>) => <>{children}</>,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/avatar', () => ({
  Avatar: ({ children, ...props }: ComponentProps<'span'>) => (
    <span {...props}>{children}</span>
  ),
  AvatarFallback: ({ children, ...props }: ComponentProps<'span'>) => (
    <span {...props}>{children}</span>
  ),
  AvatarImage: ({ alt, className }: ImgHTMLAttributes<HTMLImageElement>) => (
    <span role="img" aria-label={alt} className={className} />
  ),
}));

describe('BoardUserPresenceAvatars', () => {
  it.each([
    [['me', 'other'], false],
    [['me'], true],
    [['other'], false],
    [[], false],
  ])('applies supported filters for %j with Mine=%s', (ids, mine) => {
    const assignees = ids.map((id) => ({ id, display_name: id }));
    presence.metadata = {
      listStatusFilter: 'open',
      filters: {
        ...DEFAULT_BOARD_FILTERS,
        assignees,
        includeMyTasks: true,
        includeUnassigned: true,
        projects: [{ id: 'project', name: 'Platform' }],
        labels: [{ id: 'bug', name: 'Bug', color: 'RED' } as never],
        priorities: ['high'],
        dueDateRange: { from: new Date('2026-01-01') },
        estimationRange: { min: 5 },
        sourceScope: 'external_specific',
        sourceWorkspaceIds: ['other-workspace'],
        sourceBoardIds: ['other-board'],
        searchQuery: 'hidden search',
        sortBy: 'due-date-asc',
      },
    };
    const onFiltersChange = vi.fn();
    const onListStatusFilterChange = vi.fn();
    render(
      <BoardUserPresenceAvatarsComponent
        boardId="board-1"
        currentMetadata={{
          filters: DEFAULT_BOARD_FILTERS,
          listStatusFilter: 'all',
        }}
        onFiltersChange={onFiltersChange}
        onListStatusFilterChange={onListStatusFilterChange}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'apply_their_filters' })
    );
    expect(onListStatusFilterChange).toHaveBeenCalledWith('open');
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...DEFAULT_BOARD_FILTERS,
      assignees,
      includeMyTasks: mine,
      includeUnassigned: ids.length === 0,
      projects: [{ id: 'project', name: 'Platform' }],
    });
  });

  it('fills the realtime avatar frame without clipping its presence ring', () => {
    const presenceState = {
      'user-1': [
        {
          user: {
            id: 'user-1',
            display_name: 'Ada Lovelace',
            email: 'ada@example.com',
            avatar_url: 'https://example.com/avatar.png',
          },
          online_at: '2026-08-20T00:00:00.000Z',
          session_id: 'session-1',
          metadata: {},
          presence_ref: 'presence-1',
        },
      ],
    } as RealtimePresenceState<UserPresenceState>;

    render(
      <BoardUserPresenceAvatars
        presenceState={presenceState}
        currentUserId="user-1"
        applyUserBoardView={vi.fn()}
      />
    );

    // The popover mock also renders the viewer list, so take the frame's image.
    const avatarImage = screen.getAllByLabelText('Ada Lovelace')[0]!;
    expect(avatarImage).toHaveClass('object-cover');
    expect(avatarImage).not.toHaveClass('p-0.5');
    expect(avatarImage.parentElement).toHaveClass('ring-inset');
  });
});
