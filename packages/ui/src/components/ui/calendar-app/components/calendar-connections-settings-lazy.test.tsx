import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../dialog';
import { CalendarConnectionsSettingsContent } from './calendar-connections-settings-lazy';
import { useCalendarConnectionsManager } from './use-calendar-connections-manager';

const deferred = vi.hoisted(() => {
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { ready, release: () => release(), load: vi.fn() };
});

vi.mock('./use-calendar-connections-manager', () => ({
  useCalendarConnectionsManager: (wsId: string) => ({ wsId }),
}));

vi.mock('./calendar-connections-settings-content', async () => {
  deferred.load();
  await deferred.ready;
  return {
    CalendarConnectionsSettingsContent: ({
      state,
      className,
    }: {
      state: { wsId: string };
      className?: string;
    }) => <div className={className}>Settings for {state.wsId}</div>,
  };
});

function Fixture() {
  const state = useCalendarConnectionsManager('synthetic-workspace');
  return (
    <Dialog>
      <DialogTrigger>Manage calendars</DialogTrigger>
      <DialogContent>
        <DialogTitle>Calendar settings</DialogTitle>
        <CalendarConnectionsSettingsContent state={state} className="fixture" />
      </DialogContent>
    </Dialog>
  );
}

describe('Calendar settings loading', () => {
  it('loads on opening, forwards state and reuses the module on reopening', async () => {
    render(<Fixture />);
    expect(deferred.load).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Manage calendars' }));
    await waitFor(() => expect(deferred.load).toHaveBeenCalledTimes(1));
    expect(document.querySelector('[aria-busy="true"]')).toHaveClass('h-64');

    await act(async () => {
      deferred.release();
      await deferred.ready;
    });
    expect(
      await screen.findByText('Settings for synthetic-workspace')
    ).toHaveClass('fixture');
    expect(
      document.querySelector('[aria-busy="true"]')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Manage calendars' }));
    expect(
      await screen.findByText('Settings for synthetic-workspace')
    ).toBeVisible();
    expect(deferred.load).toHaveBeenCalledTimes(1);
  });
});
