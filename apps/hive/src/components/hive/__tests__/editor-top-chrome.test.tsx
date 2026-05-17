import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { HiveNpc, HiveWorldData } from '@/engine/types';
import messages from '../../../../messages/en.json';
import { EditorTopChrome } from '../editor-top-chrome';
import type { HiveAiContextState } from '../use-hive-ai-context';

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
const aiContext = {
  activeCreditSource: 'workspace',
  aiRunContext: null,
  creditWsId: null,
  credits: null,
  isLoading: false,
  model: {
    label: 'gemini-2.5-flash-lite',
    provider: 'google',
    value: 'google/gemini-2.5-flash-lite',
  },
  models: [],
  personalWorkspaceId: null,
  selectedWorkspace: null,
  selectedWorkspaceCredits: null,
  setCreditSource: vi.fn(),
  setModelId: vi.fn(),
  setWorkspaceId: vi.fn(),
  workspaceCreditLocked: false,
  workspaceId: null,
  workspaces: [],
} satisfies HiveAiContextState;

describe('EditorTopChrome', () => {
  it('renders compact status chips without title or helper text', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditorTopChrome
          aiContext={aiContext}
          chatOpen={false}
          currentUser={{
            displayName: 'Local Researcher',
            email: 'local@tuturuuu.com',
            id: 'user-1',
          }}
          inspectorPanel={<div>Inspector panel</div>}
          isAdmin={false}
          isRunningNpc={false}
          miniMapCollapsed={false}
          mode="world"
          npcLabCollapsed
          npcs={[{ id: 'npc-1' } as HiveNpc]}
          onChangeMode={vi.fn()}
          onToggleChat={vi.fn()}
          onToggleInspector={vi.fn()}
          onToggleMiniMap={vi.fn()}
          onPatchNpc={vi.fn()}
          onRunNpc={vi.fn()}
          onRunNpcInteraction={vi.fn()}
          onToggleNpcLab={vi.fn()}
          onUpdateServerSettings={vi.fn()}
          presenceCount={2}
          realtimeStatus="connected"
          revision={4}
          rightCollapsed
          selectedNpc={null}
          selectedServer={null}
          serverPicker={<div>Server picker</div>}
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
    expect(screen.getByText('Server picker')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'World view' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Workflow graph' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Toggle inspector' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Toggle NPC lab' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Toggle mini-map' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Open agent chat' })
    ).toBeTruthy();
  });
});
