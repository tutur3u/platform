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
    render(
      <EmptyScreen assistantName="Mira" setInput={setInput} userName="Phúc" />
    );

    fireEvent.click(screen.getByRole('button', { name: /quick_calendar/ }));

    expect(setInput).toHaveBeenCalledWith('quick_calendar');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mira' })
    ).toBeTruthy();
    expect(screen.getByText(/good_/)).toBeTruthy();
    expect(screen.getByText('quick_calendar_desc')).toBeTruthy();
    expect(screen.getByText('quick_tasks_desc')).toBeTruthy();
  });

  it('keeps recent conversations in the sidebar instead of crowding the prompt', () => {
    render(<EmptyScreen assistantName="Mira" setInput={vi.fn()} />);

    expect(screen.queryByRole('link', { name: /Roadmap review/ })).toBeNull();
  });
});
