import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { HiveNpc, HiveWorldData } from '@/engine/types';
import messages from '../../../../../messages/en.json';
import type { HiveAiContextState } from '../../use-hive-ai-context';
import { NpcLabPanel } from '../npc-lab-panel';

const world = {
  blocks: [{ id: 'block-1', position: { x: 0, y: 0, z: 0 }, type: 'grass' }],
  objects: [{ id: 'house-1', position: { x: 0, y: 1, z: 0 }, type: 'house' }],
} satisfies HiveWorldData;

const npcs = [
  createNpc('npc-1', 'Bee Keeper'),
  createNpc('npc-2', 'Ada Planner'),
];
const aiContext = {
  activeCreditSource: 'workspace',
  aiRunContext: {
    creditSource: 'workspace',
    creditWsId: '00000000-0000-4000-8000-000000000010',
    model: 'google/gemini-2.5-flash-lite',
  },
  creditWsId: '00000000-0000-4000-8000-000000000010',
  credits: null,
  isLoading: false,
  model: {
    label: 'gemini-2.5-flash-lite',
    provider: 'google',
    value: 'google/gemini-2.5-flash-lite',
  },
  models: [
    {
      label: 'gemini-2.5-flash-lite',
      provider: 'google',
      value: 'google/gemini-2.5-flash-lite',
    },
  ],
  personalWorkspaceId: '00000000-0000-4000-8000-000000000011',
  selectedWorkspace: null,
  selectedWorkspaceCredits: null,
  setCreditSource: vi.fn(),
  setModelId: vi.fn(),
  setWorkspaceId: vi.fn(),
  workspaceCreditLocked: false,
  workspaceId: '00000000-0000-4000-8000-000000000010',
  workspaces: [],
} satisfies HiveAiContextState;

function createNpc(id: string, name: string): HiveNpc {
  return {
    backstory: 'Keeps local context for a research world.',
    backstoryEnabled: true,
    customPromptEnabled: false,
    id,
    memoryEnabled: true,
    model: 'gemma4',
    name,
    position: { x: 0, y: 1, z: 0 },
    role: 'Researcher',
    serverId: 'server-1',
    settings: {},
    systemPrompt: 'Observe the world.',
  };
}

function renderPanel(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe('NpcLabPanel', () => {
  it('edits the selected NPC as a draft before saving', () => {
    const onPatchNpc = vi.fn();
    const onRun = vi.fn();

    renderPanel(
      <NpcLabPanel
        aiContext={aiContext}
        isRunning={false}
        lastRunLabel="Last run completed"
        npcs={npcs}
        onPatchNpc={onPatchNpc}
        onRun={onRun}
        onRunInteraction={vi.fn()}
        revision={14}
        selectedNpc={npcs[1]!}
        world={world}
      />
    );

    expect(screen.getByText('Selected NPC')).toBeTruthy();
    expect(screen.getByText('Last run completed')).toBeTruthy();

    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    expect(nameInput.value).toBe('Ada Planner');

    fireEvent.change(nameInput, { target: { value: 'Ada Forecaster' } });
    expect(onPatchNpc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onPatchNpc).toHaveBeenCalledWith(
      'npc-2',
      expect.objectContaining({ name: 'Ada Forecaster' })
    );

    expect(onRun).not.toHaveBeenCalled();
  });

  it('launches manual runs and targeted NPC interactions from the interactions tab', () => {
    const onRun = vi.fn();
    const onRunInteraction = vi.fn();

    renderPanel(
      <NpcLabPanel
        aiContext={aiContext}
        initialTab="interactions"
        isRunning={false}
        npcs={npcs}
        onPatchNpc={vi.fn()}
        onRun={onRun}
        onRunInteraction={onRunInteraction}
        revision={14}
        selectedNpc={npcs[0]!}
        world={world}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enhanced run' }));
    expect(onRun).toHaveBeenCalledWith('npc-1', 'enhanced');

    fireEvent.click(screen.getByRole('button', { name: 'Start interaction' }));
    expect(onRunInteraction).toHaveBeenCalledWith({
      maxTurns: 4,
      prompt: null,
      sourceNpcId: 'npc-1',
      targetNpcId: 'npc-2',
    });
    expect(
      screen.getByText('Active model: gemini-2.5-flash-lite')
    ).toBeTruthy();
  });

  it('asks for an NPC selection instead of editing the first NPC by default', () => {
    renderPanel(
      <NpcLabPanel
        aiContext={aiContext}
        isRunning={false}
        npcs={npcs}
        onPatchNpc={vi.fn()}
        onRun={vi.fn()}
        onRunInteraction={vi.fn()}
        revision={14}
        selectedNpc={null}
        world={world}
      />
    );

    expect(screen.getByText('No NPC selected')).toBeTruthy();
    expect(
      screen.getByText('Select an NPC to edit prompts and run decisions.')
    ).toBeTruthy();
    expect(screen.queryByLabelText('Name')).toBeNull();
  });
});
