import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AIChat } from '@tuturuuu/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyScreen } from './empty-screen';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('Rewise assistant home', () => {
  afterEach(cleanup);

  it('moves a guided workflow into the persistent composer', () => {
    const setInput = vi.fn();
    render(
      <EmptyScreen locale="en" setInput={setInput} workspaceSlug="personal" />
    );

    fireEvent.click(screen.getByRole('button', { name: /starter_plan/ }));

    expect(setInput).toHaveBeenCalledWith('starter_plan_prompt');
  });

  it('keeps recent conversations inside the selected workspace', () => {
    render(
      <EmptyScreen
        chats={
          [
            {
              id: 'chat-1',
              title: 'Roadmap review',
            },
          ] as AIChat[]
        }
        locale="en"
        setInput={vi.fn()}
        workspaceSlug="personal"
      />
    );

    expect(
      screen.getByRole('link', { name: /Roadmap review/ }).getAttribute('href')
    ).toBe('/personal/c/chat-1');
  });
});
