import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToolDock } from '../tool-dock';

describe('ToolDock', () => {
  it('renders core voxel editor tools', () => {
    render(
      <ToolDock
        activeObject="house"
        activeTerrain="grass"
        onSelectObject={vi.fn()}
        onSelectTerrain={vi.fn()}
        onSetTool={vi.fn()}
        tool="select"
      />
    );

    expect(screen.getByTitle('Select')).toBeTruthy();
    expect(screen.getByTitle('Terrain')).toBeTruthy();
    expect(screen.getByTitle('Erase')).toBeTruthy();
    expect(screen.getByTitle('NPC')).toBeTruthy();
    expect(screen.getByText('House 5')).toBeTruthy();
  });
});
