import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyScreen } from './empty-screen';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('Rewise assistant home', () => {
  afterEach(cleanup);

  it('moves a guided workflow into the persistent composer', () => {
    const setInput = vi.fn();
    render(<EmptyScreen setInput={setInput} />);

    fireEvent.click(screen.getByRole('button', { name: /starter_plan/ }));

    expect(setInput).toHaveBeenCalledWith('starter_plan_prompt');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Rewise' })
    ).toBeTruthy();
    expect(screen.getByText('assistant_heading')).toBeTruthy();
    expect(screen.queryByText('capability_tools_title')).toBeNull();
  });

  it('keeps recent conversations in the sidebar instead of crowding the prompt', () => {
    render(<EmptyScreen setInput={vi.fn()} />);

    expect(screen.queryByRole('link', { name: /Roadmap review/ })).toBeNull();
  });
});
