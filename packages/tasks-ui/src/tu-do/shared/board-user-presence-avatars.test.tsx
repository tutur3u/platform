import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import type { UserPresenceState } from '@tuturuuu/tasks-ui/hooks/usePresence';
import type { ComponentProps, ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BoardUserPresenceAvatars } from './board-user-presence-avatars';

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
  it('keeps the complete realtime avatar image visible inside its frame', () => {
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

    expect(screen.getByLabelText('Ada Lovelace')).toHaveClass(
      'object-contain',
      'p-0.5'
    );
  });
});
