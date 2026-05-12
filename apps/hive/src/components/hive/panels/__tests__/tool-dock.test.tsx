import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToolDock } from '../tool-dock';

describe('ToolDock', () => {
  it('renders core voxel editor tools', () => {
    render(
      <ToolDock
        activeBuildMode="terrain"
        activeObject="house"
        activeTerrain="grass"
        autoTimeEnabled={false}
        autoTimeSpeed={10}
        gaplessMode={true}
        onRotateSelection={vi.fn()}
        onSelectBuildMode={vi.fn()}
        onSelectObject={vi.fn()}
        onSelectTerrain={vi.fn()}
        onSelectTimeTheme={vi.fn()}
        onSetAutoTimeSpeed={vi.fn()}
        onSetTool={vi.fn()}
        onToggle={vi.fn()}
        onToggleAutoTime={vi.fn()}
        onToggleGapless={vi.fn()}
        timeTheme="morning"
        tool="select"
      />
    );

    expect(screen.getByTitle('Select')).toBeTruthy();
    expect(screen.getByTitle('Build')).toBeTruthy();
    expect(screen.getByTitle('Erase')).toBeTruthy();
    expect(screen.queryByText('Blocks')).toBeNull();
  });

  it('shows grouped catalogs only in build mode', () => {
    render(
      <ToolDock
        activeBuildMode="terrain"
        activeObject="house"
        activeTerrain="grass"
        autoTimeEnabled={false}
        autoTimeSpeed={10}
        gaplessMode={true}
        onRotateSelection={vi.fn()}
        onSelectBuildMode={vi.fn()}
        onSelectObject={vi.fn()}
        onSelectTerrain={vi.fn()}
        onSelectTimeTheme={vi.fn()}
        onSetAutoTimeSpeed={vi.fn()}
        onSetTool={vi.fn()}
        onToggle={vi.fn()}
        onToggleAutoTime={vi.fn()}
        onToggleGapless={vi.fn()}
        timeTheme="morning"
        tool="build"
      />
    );

    expect(screen.getByText('Blocks')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Objects'));
    expect(screen.getByText('House H')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Systems'));
    expect(screen.getByText('Bridge J')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Agents'));
    expect(screen.getByText('NPC 1')).toBeTruthy();
  });

  it('keeps environment settings in a dedicated dock tab', () => {
    render(
      <ToolDock
        activeBuildMode="terrain"
        activeObject="house"
        activeTerrain="grass"
        autoTimeEnabled={false}
        autoTimeSpeed={10}
        gaplessMode={true}
        onRotateSelection={vi.fn()}
        onSelectBuildMode={vi.fn()}
        onSelectObject={vi.fn()}
        onSelectTerrain={vi.fn()}
        onSelectTimeTheme={vi.fn()}
        onSetAutoTimeSpeed={vi.fn()}
        onSetTool={vi.fn()}
        onToggle={vi.fn()}
        onToggleAutoTime={vi.fn()}
        onToggleGapless={vi.fn()}
        timeTheme="morning"
        tool="select"
      />
    );

    expect(screen.queryByTitle('Toggle gapless blocks')).toBeNull();
    fireEvent.click(screen.getByTitle('Editor settings'));
    expect(screen.getByTitle('Toggle gapless blocks')).toBeTruthy();
    expect(screen.getByTitle('Toggle automatic 24 hour cycle')).toBeTruthy();
  });
});
