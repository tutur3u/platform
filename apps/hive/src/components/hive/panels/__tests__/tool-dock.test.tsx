import { fireEvent, render, screen, within } from '@testing-library/react';
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
        isRunningSimulationTick={false}
        onRotateSelection={vi.fn()}
        onRunSimulationTick={vi.fn()}
        onSelectBuildMode={vi.fn()}
        onSelectObject={vi.fn()}
        onSelectTerrain={vi.fn()}
        onSelectTimeTheme={vi.fn()}
        onSetAutoTimeSpeed={vi.fn()}
        onSetTool={vi.fn()}
        onToggle={vi.fn()}
        onToggleAutoTime={vi.fn()}
        onToggleGapless={vi.fn()}
        onUpdateServerSettings={vi.fn()}
        timeTheme="morning"
        tool="select"
      />
    );

    expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Build' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Erase' })).toBeTruthy();
    expect(
      within(screen.getByRole('button', { name: 'Erase' })).queryByText('E')
    ).toBeNull();
    expect(
      within(
        screen.getByRole('button', { name: 'Editor settings' })
      ).queryByText('Settings')
    ).toBeNull();
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
        isRunningSimulationTick={false}
        onRotateSelection={vi.fn()}
        onRunSimulationTick={vi.fn()}
        onSelectBuildMode={vi.fn()}
        onSelectObject={vi.fn()}
        onSelectTerrain={vi.fn()}
        onSelectTimeTheme={vi.fn()}
        onSetAutoTimeSpeed={vi.fn()}
        onSetTool={vi.fn()}
        onToggle={vi.fn()}
        onToggleAutoTime={vi.fn()}
        onToggleGapless={vi.fn()}
        onUpdateServerSettings={vi.fn()}
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
        isRunningSimulationTick={false}
        onRotateSelection={vi.fn()}
        onRunSimulationTick={vi.fn()}
        onSelectBuildMode={vi.fn()}
        onSelectObject={vi.fn()}
        onSelectTerrain={vi.fn()}
        onSelectTimeTheme={vi.fn()}
        onSetAutoTimeSpeed={vi.fn()}
        onSetTool={vi.fn()}
        onToggle={vi.fn()}
        onToggleAutoTime={vi.fn()}
        onToggleGapless={vi.fn()}
        onUpdateServerSettings={vi.fn()}
        timeTheme="morning"
        tool="select"
      />
    );

    expect(screen.queryByTitle('Toggle gapless blocks')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editor settings' }));
    expect(screen.getByTitle('Toggle gapless blocks')).toBeTruthy();
    expect(screen.getByTitle('Toggle automatic 24 hour cycle')).toBeTruthy();
  });
});
