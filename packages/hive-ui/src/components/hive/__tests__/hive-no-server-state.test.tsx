import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../test/messages/en.json';
import { HiveNoServerState } from '../hive-no-server-state';

describe('HiveNoServerState', () => {
  it('shows one compact server selection surface while the editor is unavailable', () => {
    const onCreateServer = vi.fn();
    const onSelectServer = vi.fn();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <HiveNoServerState
          isAdmin
          onCreateServer={onCreateServer}
          onSelectServer={onSelectServer}
          servers={[
            {
              createdAt: '2026-05-14T00:00:00.000Z',
              description: 'Shared test world',
              enabled: true,
              id: 'server-1',
              maxPlayers: 8,
              name: 'Research Garden',
              settings: {},
              slug: 'research-garden',
            },
          ]}
        />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByRole('heading', { name: 'No server selected' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('toolbar', { name: 'Hive top toolbar' })
    ).toBeNull();
    expect(
      screen.queryByRole('toolbar', { name: 'Hive tool dock' })
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Research Garden/u }));
    expect(onSelectServer).toHaveBeenCalledWith('server-1');

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreateServer).toHaveBeenCalledOnce();
  });
});
