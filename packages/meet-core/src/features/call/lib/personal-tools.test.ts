import { InternalApiError } from '@tuturuuu/internal-api/client';
import { expect, it, vi } from 'vitest';
import {
  loadPersonalTools,
  type personalToolsApi,
  personalToolsFailureKeepsSnapshot,
} from './personal-tools';

function api() {
  return {
    profile: vi.fn().mockResolvedValue({ id: 'actor' }),
    workspaces: vi.fn().mockResolvedValue([
      { id: 'room-team', personal: false },
      { id: 'personal', personal: true },
    ]),
    tasks: vi.fn().mockResolvedValue({
      overdue: [],
      today: [{ id: 'task', name: 'Private task' }],
      upcoming: [],
      totalActiveTasks: 1,
    }),
    calendar: vi
      .fn()
      .mockResolvedValue({ data: [{ id: 'event', title: 'Private event' }] }),
  } satisfies typeof personalToolsApi;
}
it('reads only the authenticated personal workspace, never the meeting workspace', async () => {
  const services = api();
  const result = await loadPersonalTools(
    'actor',
    services,
    new Date('2026-10-05T00:00:00Z')
  );
  expect(services.tasks).toHaveBeenCalledWith({
    wsId: 'personal',
    isPersonal: true,
  });
  expect(services.calendar.mock.calls[0]?.[0]).toBe('personal');
  expect(result?.tasks?.today[0]?.name).toBe('Private task');
  expect(services.profile).toHaveBeenCalledTimes(2);
});
it('rejects an actor mismatch before any workspace or private data read', async () => {
  const services = api();
  await expect(loadPersonalTools('another-actor', services)).rejects.toThrow(
    'actor_changed'
  );
  expect(services.workspaces).not.toHaveBeenCalled();
  expect(services.tasks).not.toHaveBeenCalled();
});
it('discards completed private reads if the authenticated actor changed', async () => {
  const services = api();
  services.profile
    .mockResolvedValueOnce({ id: 'actor' })
    .mockResolvedValueOnce({ id: 'different' });
  await expect(loadPersonalTools('actor', services)).rejects.toThrow(
    'actor_changed'
  );
});
it('never substitutes the meeting or team workspace when personal is unavailable', async () => {
  const services = api();
  services.workspaces.mockResolvedValue([{ id: 'room-team', personal: false }]);
  expect(await loadPersonalTools('actor', services)).toBeNull();
  expect(services.tasks).not.toHaveBeenCalled();
  expect(services.calendar).not.toHaveBeenCalled();
});
it('retains independently available calendar data when tasks fail', async () => {
  const services = api();
  services.tasks.mockRejectedValue(new Error('unavailable'));
  const result = await loadPersonalTools('actor', services);
  expect(result?.tasks).toBeNull();
  expect(result?.events?.[0]?.title).toBe('Private event');
});

it('retains authorized snapshots only for temporary availability failures', () => {
  expect(
    personalToolsFailureKeepsSnapshot(new TypeError('Failed to fetch'))
  ).toBe(true);
  expect(
    personalToolsFailureKeepsSnapshot(new InternalApiError('server', 503))
  ).toBe(true);
  expect(
    personalToolsFailureKeepsSnapshot(new InternalApiError('rate', 429))
  ).toBe(true);
  expect(
    personalToolsFailureKeepsSnapshot(new InternalApiError('denied', 403))
  ).toBe(false);
  expect(
    personalToolsFailureKeepsSnapshot(new InternalApiError('signed out', 401))
  ).toBe(false);
  expect(
    personalToolsFailureKeepsSnapshot(new Error('personal_tools_actor_changed'))
  ).toBe(false);
});

it('retains same-actor source snapshots for temporary partial failures but clears definitive denials', async () => {
  const services = api();
  const previous = await loadPersonalTools('actor', services);
  services.tasks.mockRejectedValue(new InternalApiError('rate', 429));
  services.calendar.mockRejectedValue(new TypeError('Failed to fetch'));
  const retained = await loadPersonalTools(
    'actor',
    services,
    new Date(),
    previous
  );
  expect(retained?.tasks).toEqual(previous?.tasks);
  expect(retained?.events).toEqual(previous?.events);
  expect(retained?.tasksStatus).toBe('stale');
  expect(retained?.calendarStatus).toBe('stale');
  services.tasks.mockRejectedValue(new InternalApiError('denied', 403));
  const denied = await loadPersonalTools(
    'actor',
    services,
    new Date(),
    previous
  );
  expect(denied?.tasks).toBeNull();
  expect(denied?.tasksStatus).toBe('unavailable');
  expect(denied?.events).toEqual(previous?.events);
});
it('does not retain another actor or workspace snapshot and rejects incidental TypeErrors', async () => {
  const services = api();
  const previous = await loadPersonalTools('actor', services);
  services.tasks.mockRejectedValue(new TypeError('Failed to fetch'));
  const different = await loadPersonalTools('actor', services, new Date(), {
    ...previous!,
    actorId: 'different',
  });
  expect(different?.tasks).toBeNull();
  expect(
    personalToolsFailureKeepsSnapshot(new TypeError('invalid local data'))
  ).toBe(false);
});
