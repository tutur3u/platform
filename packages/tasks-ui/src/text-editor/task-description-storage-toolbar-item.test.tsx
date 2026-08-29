import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TaskDescriptionStorageToolbarItem } from './task-description-storage-toolbar-item';

describe('TaskDescriptionStorageToolbarItem', () => {
  it('shows only the progress ring and rounded percentage in the toolbar', async () => {
    render(
      <TaskDescriptionStorageToolbarItem
        counterText="99% left"
        isOverLimit={false}
        liveMessage="Room left in your description. 99% left. 120 of 10,000 used"
        percentLeft={99}
        statusText="Room left in your description. Formatting, mentions, and embeds count too."
        usageText="120 of 10,000 used"
      />
    );

    const indicator = screen.getByRole('button', {
      name: 'Room left in your description. 99% left. 120 of 10,000 used',
    });
    expect(indicator).toHaveClass('h-8', 'shrink-0');
    const percentage = within(indicator).getByText('99%');
    expect(percentage).toHaveClass('rounded-full', 'tabular-nums');
    expect(within(indicator).queryByText('99% left')).not.toBeInTheDocument();
    expect(
      within(indicator).queryByText(/Room left in your description/)
    ).not.toBeInTheDocument();
    fireEvent.focus(indicator);
    expect(
      await screen.findByText(
        'Room left in your description. Formatting, mentions, and embeds count too.'
      )
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('tooltip')).getByText('120 of 10,000 used')
    ).toBeInTheDocument();
  });

  it('uses the destructive treatment after the description exceeds its limit', () => {
    render(
      <TaskDescriptionStorageToolbarItem
        counterText="0% left"
        isOverLimit
        liveMessage="Description is over 10,000 characters. 0% left. 10,100 of 10,000 used"
        percentLeft={0}
        statusText="Description is over 10,000 characters."
        usageText="10,100 of 10,000 used"
      />
    );

    expect(
      screen.getByRole('button', {
        name: 'Description is over 10,000 characters. 0% left. 10,100 of 10,000 used',
      })
    ).toHaveClass('border-destructive/40');
    expect(screen.getByText('0%')).toHaveClass(
      'rounded-full',
      'text-destructive'
    );
  });
});
