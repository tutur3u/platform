import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { HiveNpc, HiveWorldData } from '@/engine/types';
import messages from '../../../../messages/en.json';
import { EditorTopChrome } from '../editor-top-chrome';

const world = {
  blocks: [
    { id: 'block-1', position: { x: 0, y: 0, z: 0 }, type: 'grass' },
    { id: 'block-2', position: { x: 1, y: 0, z: 0 }, type: 'path' },
    { id: 'block-3', position: { x: 2, y: 0, z: 0 }, type: 'water' },
  ],
  objects: [
    { id: 'house-1', position: { x: 0, y: 1, z: 0 }, type: 'house' },
    { id: 'tree-1', position: { x: 1, y: 1, z: 0 }, type: 'tree' },
  ],
} satisfies HiveWorldData;

describe('EditorTopChrome', () => {
  it('renders compact status chips without title or helper text', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditorTopChrome
          currentUser={{
            displayName: 'Local Researcher',
            email: 'local@tuturuuu.com',
            id: 'user-1',
          }}
          isRunningNpc={false}
          npcLabCollapsed
          npcs={[{ id: 'npc-1' } as HiveNpc]}
          onPatchNpc={vi.fn()}
          onRunNpc={vi.fn()}
          onToggleNpcLab={vi.fn()}
          presenceCount={2}
          realtimeStatus="connected"
          revision={4}
          rightCollapsed
          world={world}
        />
      </NextIntlClientProvider>
    );

    expect(screen.queryByText(/Hive World/i)).toBeNull();
    expect(screen.queryByText(/Tap to place/i)).toBeNull();
    expect(screen.getByLabelText('Realtime connection')).toBeTruthy();
    expect(screen.getByLabelText('3 blocks')).toBeTruthy();
    expect(screen.getByLabelText('2 objects')).toBeTruthy();
    expect(screen.getByLabelText('1 NPC')).toBeTruthy();
    expect(screen.getByLabelText('2 online')).toBeTruthy();
  });
});
