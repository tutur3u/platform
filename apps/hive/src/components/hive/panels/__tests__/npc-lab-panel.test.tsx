import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { HiveNpc, HiveWorldData } from '@/engine/types';
import messages from '../../../../../messages/en.json';
import { NpcLabPanel } from '../npc-lab-panel';

const world = {
  blocks: [{ id: 'block-1', position: { x: 0, y: 0, z: 0 }, type: 'grass' }],
  objects: [{ id: 'house-1', position: { x: 0, y: 1, z: 0 }, type: 'house' }],
} satisfies HiveWorldData;

const npcs = [
  createNpc('npc-1', 'Bee Keeper'),
  createNpc('npc-2', 'Ada Planner'),
];

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
  it('edits and runs the selected NPC instead of the first NPC', () => {
    const onPatchNpc = vi.fn();
    const onRun = vi.fn();

    renderPanel(
      <NpcLabPanel
        isRunning={false}
        lastRunLabel="Last run completed"
        npcs={npcs}
        onPatchNpc={onPatchNpc}
        onRun={onRun}
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
    expect(onPatchNpc).toHaveBeenCalledWith('npc-2', {
      name: 'Ada Forecaster',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Enhanced run' }));
    expect(onRun).toHaveBeenCalledWith('npc-2', 'enhanced');
  });

  it('asks for an NPC selection instead of editing the first NPC by default', () => {
    renderPanel(
      <NpcLabPanel
        isRunning={false}
        npcs={npcs}
        onPatchNpc={vi.fn()}
        onRun={vi.fn()}
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
