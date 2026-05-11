import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HiveServer } from '@/engine/types';
import { ServerNavigator } from '../server-navigator';

const server: HiveServer = {
  createdAt: '2026-05-11T00:00:00.000Z',
  description: 'A shared world',
  enabled: true,
  id: 'server-1',
  maxPlayers: 32,
  name: 'Research Garden',
  slug: 'research-garden',
};

const currentUser = {
  email: 'researcher@tuturuuu.com',
  id: 'user-1',
};

describe('ServerNavigator', () => {
  it('shows admin server and world controls only for admins', () => {
    const onEditServer = vi.fn();
    const onResetWorld = vi.fn();

    render(
      <ServerNavigator
        activeServerId={server.id}
        currentUser={currentUser}
        isAdmin
        onCreateServer={vi.fn()}
        onDeleteServer={vi.fn()}
        onEditServer={onEditServer}
        onResetWorld={onResetWorld}
        onSelectServer={vi.fn()}
        servers={[server]}
      />
    );

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Reseed'));

    expect(onEditServer).toHaveBeenCalledWith(server);
    expect(onResetWorld).toHaveBeenCalledWith('reseed');
    expect(screen.getAllByText('researcher@tuturuuu.com')).toHaveLength(2);
  });

  it('hides admin controls from regular hive members', () => {
    render(
      <ServerNavigator
        activeServerId={server.id}
        currentUser={currentUser}
        isAdmin={false}
        onCreateServer={vi.fn()}
        onDeleteServer={vi.fn()}
        onEditServer={vi.fn()}
        onResetWorld={vi.fn()}
        onSelectServer={vi.fn()}
        servers={[server]}
      />
    );

    expect(screen.queryByText('Platform admin controls enabled')).toBeNull();
  });
});
