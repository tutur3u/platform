import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickCommandCenter } from './quick-command-center';

describe('QuickCommandCenter', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders grouped commands and activates digit shortcuts', () => {
    const first = vi.fn();
    const second = vi.fn();

    render(
      <QuickCommandCenter
        digitShortcuts
        emptyLabel="No commands"
        groups={[
          {
            heading: 'Create',
            id: 'create',
            items: [
              {
                id: 'transaction',
                onSelect: first,
                title: 'New transaction',
              },
              {
                id: 'wallet',
                onSelect: second,
                title: 'New wallet',
              },
            ],
          },
        ]}
        onOpenChange={() => undefined}
        open
        placeholder="Search commands"
        title="Quick command center"
      />
    );

    expect(screen.getByText('New transaction')).toBeVisible();
    expect(screen.getByText('New wallet')).toBeVisible();

    fireEvent.keyDown(window, { key: '2' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('filters commands by search text', () => {
    render(
      <QuickCommandCenter
        emptyLabel="No commands"
        groups={[
          {
            heading: 'Create',
            id: 'create',
            items: [
              {
                id: 'transaction',
                onSelect: vi.fn(),
                title: 'New transaction',
              },
              {
                id: 'wallet',
                onSelect: vi.fn(),
                title: 'New wallet',
              },
            ],
          },
        ]}
        onOpenChange={() => undefined}
        open
        placeholder="Search commands"
        searchValue="wallet"
        title="Quick command center"
      />
    );

    expect(screen.getByText('New wallet')).toBeVisible();
    expect(screen.queryByText('New transaction')).not.toBeInTheDocument();
  });
});
