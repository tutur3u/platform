import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../../test/messages/en.json';
import { ToolDock } from '../tool-dock';

const baseDockProps = {
  activeBuildMode: 'terrain' as const,
  activeObject: 'house',
  activeTerrain: 'grass',
  autoTimeEnabled: false,
  autoTimeSpeed: 10,
  cameraView: 'isometric' as const,
  currency: 240,
  cropsCount: 3,
  eventsCount: 8,
  gaplessMode: true,
  isRunningSimulationTick: false,
  onRotateSelection: vi.fn(),
  onRunSimulationTick: vi.fn(),
  onSelectBuildMode: vi.fn(),
  onSelectCameraView: vi.fn(),
  onSelectObject: vi.fn(),
  onSelectTerrain: vi.fn(),
  onSetAutoTimeSpeed: vi.fn(),
  onSetClockMinutes: vi.fn(),
  onSetSeason: vi.fn(),
  onSetTool: vi.fn(),
  onSetWeather: vi.fn(),
  onToggle: vi.fn(),
  onToggleAutoTime: vi.fn(),
  onToggleGapless: vi.fn(),
  onUpdateServerSettings: vi.fn(),
  presenceCount: 4,
  realtimeStatus: 'connected' as const,
  revision: 12,
  season: 'spring' as const,
  serverName: 'North Lab',
  simulatedMinutes: 480,
  syncNotice: 'World saved',
  tool: 'select' as const,
  warehousesCount: 2,
  weather: 'clear' as const,
  worldCounts: {
    blocks: 11,
    npcs: 5,
    objects: 6,
  },
};

function renderDock(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe('ToolDock', () => {
  it('renders core voxel editor tools', () => {
    renderDock(<ToolDock {...baseDockProps} />);

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
    expect(
      screen.getByRole('button', { name: 'Live operations' })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Blocks' })).toBeNull();
  });

  it('shows grouped catalogs only in build mode', () => {
    renderDock(<ToolDock {...baseDockProps} tool="build" />);

    expect(screen.getByRole('button', { name: 'Blocks' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Objects' }));
    expect(screen.getByRole('button', { name: 'House H' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Systems' }));
    expect(screen.getByRole('button', { name: 'Bridge J' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'NPCs' }));
    expect(screen.getByRole('button', { name: 'NPC 1' })).toBeTruthy();
  });

  it('keeps environment settings in a dedicated dock tab', () => {
    renderDock(<ToolDock {...baseDockProps} />);

    expect(
      screen.queryByRole('button', { name: 'Minimal tile gaps' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editor settings' }));
    expect(
      screen.getByRole('button', { name: 'Minimal tile gaps' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Automatic 24 hour cycle' })
    ).toBeTruthy();
    expect(screen.getByLabelText('Time of day 08:00')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Spring' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear weather' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Isometric camera' })
    ).toBeTruthy();
  });

  it('opens live operations as an explicit persistent dock panel', () => {
    renderDock(<ToolDock {...baseDockProps} />);

    expect(screen.queryByText('North Lab')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Live operations' }));

    expect(screen.getByText('North Lab')).toBeTruthy();
    expect(screen.getByText('Live operations')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('World saved')).toBeTruthy();
    expect(screen.getByText('Revision')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Crops')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Warehouses')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Build catalog' }));

    expect(screen.queryByText('North Lab')).toBeNull();
    expect(screen.getByRole('button', { name: 'Blocks' })).toBeTruthy();
  });
});
