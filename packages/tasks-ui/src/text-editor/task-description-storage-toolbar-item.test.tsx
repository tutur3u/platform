import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TaskDescriptionStorageToolbarItem } from './task-description-storage-toolbar-item';

describe('TaskDescriptionStorageToolbarItem', () => {
  it('renders a compact, non-shrinking capacity summary with live detail', () => {
    render(
      <TaskDescriptionStorageToolbarItem
        counterText="99% left"
        currentLength={120}
        isOverLimit={false}
        limit={10_000}
        liveMessage="Room left in your description. 99% left (120/10000)"
        percentLeft={99}
        statusText="Room left in your description. Formatting, mentions, and embeds count too."
      />
    );

    const indicator = screen.getByRole('button', {
      name: 'Room left in your description. 99% left (120/10000)',
    });
    expect(indicator).toHaveClass('h-8', 'max-w-72', 'shrink-0');
    expect(screen.getByText('99% left')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Room left in your description. Formatting, mentions, and embeds count too.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/120\/10000/)).toBeInTheDocument();
  });

  it('uses the destructive treatment after the description exceeds its limit', () => {
    render(
      <TaskDescriptionStorageToolbarItem
        counterText="0% left"
        currentLength={10_100}
        isOverLimit
        limit={10_000}
        liveMessage="Description is over 10000 characters. 0% left (10100/10000)"
        percentLeft={0}
        statusText="Description is over 10000 characters."
      />
    );

    expect(
      screen.getByRole('button', {
        name: 'Description is over 10000 characters. 0% left (10100/10000)',
      })
    ).toHaveClass('border-destructive/40');
    expect(screen.getByText('0% left')).toHaveClass('text-destructive');
  });
});
