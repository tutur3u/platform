import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHAT_MODEL } from '@/lib/chat-model';
import { AssistantHeader } from './assistant-header';
import { AssistantToolbar } from './assistant-toolbar';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined }),
}));

describe('Rewise Platform assistant chrome', () => {
  afterEach(cleanup);

  it('matches the Platform header controls and starts a new conversation', () => {
    const onNewConversation = vi.fn();
    render(
      <AssistantHeader
        onNewConversation={onNewConversation}
        workspaceSlug="personal"
      />
    );

    expect(
      screen.getByRole('button', { name: 'workspace_context_personal' })
    ).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'chat_mode' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'live_mode' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'more_actions' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'new_chat' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'my_tasks' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'upcoming_events' })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'new_chat' }));
    expect(onNewConversation).toHaveBeenCalledOnce();
  });

  it('only shows More when chat visibility is available', () => {
    render(
      <AssistantHeader
        onNewConversation={vi.fn()}
        onVisibility={vi.fn()}
        workspaceSlug="personal"
      />
    );

    expect(screen.getByRole('button', { name: 'more_actions' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'new_chat' })).toHaveLength(1);
  });

  it('shows the same compact Model, Fast, and Personal toolbar', () => {
    render(<AssistantToolbar model={DEFAULT_CHAT_MODEL} wsId="workspace-1" />);

    expect(screen.getByRole('button', { name: 'model' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'thinking_mode_fast' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'credit_source_personal' })
    ).toBeTruthy();
  });
});
