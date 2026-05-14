import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../../../messages/en.json';
import { ToolDock } from '../tool-dock';

function renderDock(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe('ToolDock', () => {
  it('renders core voxel editor tools', () => {
    renderDock(
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
    renderDock(
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

    expect(screen.getByRole('button', { name: 'Blocks' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Objects' }));
    expect(screen.getByRole('button', { name: 'House H' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Systems' }));
    expect(screen.getByRole('button', { name: 'Bridge J' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'NPCs' }));
    expect(screen.getByRole('button', { name: 'NPC 1' })).toBeTruthy();
  });

  it('keeps environment settings in a dedicated dock tab', () => {
    renderDock(
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

    expect(screen.queryByRole('button', { name: 'Gapless blocks' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editor settings' }));
    expect(screen.getByRole('button', { name: 'Gapless blocks' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Automatic 24 hour cycle' })
    ).toBeTruthy();
  });
});
