import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import messages from '../../../messages/en.json';
import { MeetScene, TaskScene } from './product-scenes';

describe('illustrated product interactions', () => {
  it('organizes sample tasks and restores the capture state', () => {
    const { container } = render(<TaskScene copy={messages.capabilities} />);
    const columns = () =>
      Array.from(container.querySelectorAll('[class*="columnLabel"]')).map(
        (el) => el.textContent
      );
    expect(columns()).toEqual(['Capture 3', 'Plan 0', 'Deliver 0']);
    fireEvent.click(screen.getByRole('button', { name: /Organize this week/ }));
    expect(columns()).toEqual(['Capture 0', 'Plan 2', 'Deliver 1']);
    fireEvent.click(screen.getByRole('button', { name: /Reset illustration/ }));
    expect(columns()).toEqual(['Capture 3', 'Plan 0', 'Deliver 0']);
  });

  it('separates the room illustration from the private approval explanation', () => {
    render(<MeetScene copy={messages.capabilities} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Explore the conversation/ })
    );
    expect(screen.getByText(messages.capabilities.meet.answer)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Private assistance' }));
    expect(screen.queryByText(messages.capabilities.meet.answer)).toBeNull();
    expect(screen.getByText(messages.capabilities.meet.privacy)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Room conversation' }));
    expect(screen.getByText(messages.capabilities.meet.answer)).toBeDefined();
    expect(
      within(screen.getByRole('figure')).getByText(
        messages.capabilities.illustration
      )
    ).toBeDefined();
  });
});
