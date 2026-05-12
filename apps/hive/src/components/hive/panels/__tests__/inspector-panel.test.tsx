import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InspectorPanel } from '../inspector-panel';

const world = {
  blocks: [
    {
      id: 'block:0:0:0',
      position: { x: 0, y: 0, z: 0 },
      type: 'crop-soil',
    },
  ],
  objects: [
    {
      id: 'object:crop:0:1:0',
      position: { x: 0, y: 1, z: 0 },
      type: 'crop',
    },
  ],
};

describe('InspectorPanel', () => {
  it('shows tile metadata and requests selected entity deletion', () => {
    const onRequestDelete = vi.fn();

    render(
      <InspectorPanel
        eventsCount={3}
        npcs={[]}
        onPatchNpc={vi.fn()}
        onRequestDelete={onRequestDelete}
        onToggle={vi.fn()}
        presenceCount={2}
        realtimeStatus="connected"
        revision={7}
        selection={{ id: 'block:0:0:0', kind: 'block' }}
        world={world}
      />
    );

    expect(screen.getByText('Surface height')).toBeTruthy();
    expect(screen.getByText('crop')).toBeTruthy();

    fireEvent.click(screen.getByText('Delete selected'));
    expect(onRequestDelete).toHaveBeenCalledWith({
      id: 'block:0:0:0',
      kind: 'block',
    });
  });
});
