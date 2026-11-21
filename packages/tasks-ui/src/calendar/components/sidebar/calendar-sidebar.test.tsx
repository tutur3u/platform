import { act, fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
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

function renderSidebar(defaultPlanPanelOpen?: boolean) {
  return render(
    <CalendarSidebar
      wsId="ws-1"
      assigneeId="user-1"
      tasks={[]}
      locale="en"
      defaultPlanPanelOpen={defaultPlanPanelOpen}
    />
  );
}

const panelCookie = () =>
  document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('calendar-plan-panel='))
    ?.split('=')[1];

describe('CalendarSidebar', () => {
  beforeEach(() => {
    document.cookie = 'calendar-plan-panel=; Path=/; Max-Age=0';
  });
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
    expect(panelCookie()).toBe('open');

    fireEvent.click(screen.getByRole('button', { name: 'collapse' }));
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(panelCookie()).toBe('closed');
  });

  it('opens as a sheet below the wide breakpoint without expanding inline', () => {
    setWideViewport(false);
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'open' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('priority-view')).toBeTruthy();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(panelCookie()).toBeUndefined();
  });

  it('renders open on first paint from the server-read state', () => {
    renderSidebar(true);
    expect(screen.getByRole('complementary', { name: 'title' })).toBeTruthy();
  });

  it('hydrates a host without server state without a mismatch', async () => {
    document.cookie = 'calendar-plan-panel=open; Path=/';
    const element = (
      <CalendarSidebar wsId="ws-1" assigneeId="user-1" tasks={[]} locale="en" />
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    expect(container.querySelector('aside')).toBeNull();
    document.body.append(container);
    const recoverable = vi.fn();
    await act(async () => {
      hydrateRoot(container, element, { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('aside')).not.toBeNull();
    container.remove();
  });

  it('falls back to the browser cookie when the host passes no state', () => {
    document.cookie = 'calendar-plan-panel=open; Path=/';
    renderSidebar();
    expect(screen.getByRole('complementary', { name: 'title' })).toBeTruthy();
  });
});
