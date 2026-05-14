import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { HiveServer } from '@/engine/types';
import { createDefaultWorld } from '@/engine/world';
import messages from '../../../../../messages/en.json';
import { HiveServerPicker } from '../hive-server-picker';

const server: HiveServer = {
  createdAt: '2026-05-11T00:00:00.000Z',
  description: 'A shared world',
  enabled: true,
  id: 'server-1',
  maxPlayers: 32,
  name: 'Research Garden',
  slug: 'research-garden',
  totalCurrency: 240,
};

function renderPicker(
  overrides: Partial<Parameters<typeof HiveServerPicker>[0]> = {}
) {
  const props = {
    activeServerId: server.id,
    isAdmin: true,
    npcs: [],
    onCreateServer: vi.fn(),
    onDeleteServer: vi.fn(),
    onEditServer: vi.fn(),
    onResetWorld: vi.fn(),
    onSelectServer: vi.fn(),
    presenceCount: 2,
    realtimeStatus: 'connected' as const,
    revision: 7,
    server,
    servers: [server],
    world: createDefaultWorld(),
    ...overrides,
  };

  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HiveServerPicker {...props} />
    </NextIntlClientProvider>
  );

  return props;
}

describe('HiveServerPicker', () => {
  it('renders server selection and admin info controls compactly', () => {
    const props = renderPicker();

    expect(
      screen.getByRole('combobox', { name: 'Select Hive server' })
    ).toBeTruthy();
    expect(screen.getByText('Research Garden')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Server info' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reseed' }));

    expect(props.onResetWorld).toHaveBeenCalledWith('reseed');
    expect(screen.getByText('Revision')).toBeTruthy();
  });
});
