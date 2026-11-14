import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarSidebar } from './calendar-sidebar';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('../priority-view', () => ({
  default: () => <div>priority-view</div>,
}));
vi.mock('../habits-panel', () => ({
  HabitsPanel: () => <div>habits-panel</div>,
}));
vi.mock('../time-tracker', () => ({
  default: () => <div>time-tracker</div>,
}));

function setWideViewport(wide: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: wide,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

function renderSidebar() {
  return render(
    <CalendarSidebar wsId="ws-1" assigneeId="user-1" tasks={[]} locale="en" />
  );
}

describe('CalendarSidebar', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('starts collapsed to a rail with a labelled open control', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: 'open' })).toBeTruthy();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('opens beside the grid on wide screens and collapses again', () => {
    setWideViewport(true);
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'open' }));

    const panel = screen.getByRole('complementary', { name: 'title' });
    expect(panel).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'tasks' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'habits' })).toBeTruthy();
    expect(screen.getByText('priority-view')).toBeTruthy();
    expect(localStorage.getItem('calendar-sidebar-collapsed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'collapse' }));
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(localStorage.getItem('calendar-sidebar-collapsed')).toBe('true');
  });

  it('opens as a sheet below the wide breakpoint without expanding inline', () => {
    setWideViewport(false);
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'open' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('priority-view')).toBeTruthy();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(localStorage.getItem('calendar-sidebar-collapsed')).toBe('true');
  });
});
