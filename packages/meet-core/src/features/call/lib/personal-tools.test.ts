import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { describe, expect, it, vi } from 'vitest';
import {
  loadPersonalChat,
  loadPersonalDrive,
  loadPersonalMeetings,
  loadPersonalTools,
  type PersonalToolsApi,
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
    meetings: vi.fn().mockResolvedValue({
      meetings: [
        {
          id: 'meeting-1',
          name: 'Private 1:1',
          time: '2026-11-28T10:00:00Z',
          created_at: '2026-11-27T00:00:00Z',
          creator_id: 'actor',
          calendar_event: null,
        },
      ],
      totalCount: 1,
    }),
    chat: vi.fn().mockResolvedValue([
      {
        id: 'conv-1',
        title: 'Design Notes',
        type: 'channel',
        description: null,
        aiEnabled: false,
        archivedAt: null,
        createdAt: '2026-11-27T00:00:00Z',
        createdBy: 'actor',
        latestMessage: null,
        memberCount: 2,
        members: [],
        metadata: {},
        unreadCount: 0,
        updatedAt: '2026-11-27T00:00:00Z',
        wsId: 'personal',
      },
    ]),
    drive: vi.fn().mockResolvedValue({
      data: [{ id: 'file-1', name: 'Q4-notes.pdf' }],
      pagination: { limit: 25, offset: 0, total: 1 },
    }),
  } satisfies PersonalToolsApi;
}

function readPersonalToolsComponentSources() {
  const componentsDir = path.resolve(import.meta.dirname, '../components');
  const panelFile = path.join(componentsDir, 'personal-tools-panel.tsx');
  const subDir = path.join(componentsDir, 'personal-tools');
  const files = [
    panelFile,
    ...readdirSync(subDir)
      .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
      .map((name) => path.join(subDir, name)),
  ];
  return files.map((filePath) => ({
    filePath,
    name: path.relative(componentsDir, filePath),
    source: readFileSync(filePath, 'utf8'),
  }));
}

it('uses published internal API entry points, including without test aliases', () => {
  const manifest = JSON.parse(
    readFileSync(
      path.resolve(
        import.meta.dirname,
        '../../../../../internal-api/package.json'
      ),
      'utf8'
    )
  );
  const sources = [
    readFileSync(path.join(import.meta.dirname, 'personal-tools.ts'), 'utf8'),
    ...readPersonalToolsComponentSources().map((entry) => entry.source),
  ];
  let totalImports = 0;
  for (const source of sources) {
    const imports = [
      ...source.matchAll(/from ['"]@tuturuuu\/internal-api\/([^'"]+)['"]/gu),
    ];
    totalImports += imports.length;
    for (const [, subpath] of imports) {
      expect(manifest.exports).toHaveProperty(`./${subpath}`);
    }
  }
  expect(totalImports).toBeGreaterThan(0);
});

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
  // Lazy per-tab endpoints are not fetched during initial panel load.
  expect(services.meetings).not.toHaveBeenCalled();
  expect(services.chat).not.toHaveBeenCalled();
  expect(services.drive).not.toHaveBeenCalled();
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

describe('lazy per-tab loaders (meetings, chat, drive)', () => {
  it('loads meetings, chat, and drive scoped to actor and workspace', async () => {
    const services = api();
    const meetings = await loadPersonalMeetings('actor', 'personal', services);
    const chat = await loadPersonalChat('actor', 'personal', services);
    const drive = await loadPersonalDrive('actor', 'personal', services);

    expect(meetings.status).toBe('ready');
    expect(meetings.items?.[0]?.name).toBe('Private 1:1');
    expect(chat.status).toBe('ready');
    expect(chat.items?.[0]?.title).toBe('Design Notes');
    expect(drive.status).toBe('ready');
    expect(drive.items?.[0]?.name).toBe('Q4-notes.pdf');
  });

  it('clears stale tab snapshots on 401/403/404 and degrades gracefully without throwing', async () => {
    const services = api();
    const prevMeetings = await loadPersonalMeetings(
      'actor',
      'personal',
      services
    );
    const prevChat = await loadPersonalChat('actor', 'personal', services);
    const prevDrive = await loadPersonalDrive('actor', 'personal', services);

    services.meetings.mockRejectedValue(new InternalApiError('denied', 403));
    services.chat.mockRejectedValue(new InternalApiError('missing', 404));
    services.drive.mockRejectedValue(new InternalApiError('signed out', 401));

    const deniedMeetings = await loadPersonalMeetings(
      'actor',
      'personal',
      services,
      prevMeetings
    );
    const missingChat = await loadPersonalChat(
      'actor',
      'personal',
      services,
      prevChat
    );
    const unauthDrive = await loadPersonalDrive(
      'actor',
      'personal',
      services,
      prevDrive
    );

    expect(deniedMeetings).toEqual({
      actorId: 'actor',
      workspaceId: 'personal',
      items: null,
      status: 'unavailable',
    });
    expect(missingChat.items).toBeNull();
    expect(missingChat.status).toBe('unavailable');
    expect(unauthDrive.items).toBeNull();
    expect(unauthDrive.status).toBe('unavailable');
  });

  it('retains previous tab snapshot only on transient failure for the same actor and workspace', async () => {
    const services = api();
    const prev = await loadPersonalDrive('actor', 'personal', services);
    services.drive.mockRejectedValue(new InternalApiError('busy', 503));

    const sameActor = await loadPersonalDrive(
      'actor',
      'personal',
      services,
      prev
    );
    expect(sameActor.status).toBe('stale');
    expect(sameActor.items).toEqual(prev.items);

    const otherActor = await loadPersonalDrive('actor', 'personal', services, {
      ...prev,
      actorId: 'someone-else',
    });
    expect(otherActor.status).toBe('unavailable');
    expect(otherActor.items).toBeNull();

    const otherWorkspace = await loadPersonalDrive(
      'actor',
      'personal',
      services,
      {
        ...prev,
        workspaceId: 'room-team',
      }
    );
    expect(otherWorkspace.status).toBe('unavailable');
    expect(otherWorkspace.items).toBeNull();
  });

  it('rejects actor mismatch before or after per-tab reads', async () => {
    const services = api();
    await expect(
      loadPersonalMeetings('wrong-actor', 'personal', services)
    ).rejects.toThrow('actor_changed');
    expect(services.meetings).not.toHaveBeenCalled();

    services.profile
      .mockResolvedValueOnce({ id: 'actor' })
      .mockResolvedValueOnce({ id: 'other' });
    await expect(
      loadPersonalChat('actor', 'personal', services)
    ).rejects.toThrow('actor_changed');
  });
});

describe('PersonalToolsPanel security and isolation boundaries', () => {
  it('contains zero iframe elements, zero raw fetch calls, and zero useEffect data fetching', () => {
    const files = readPersonalToolsComponentSources();
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const { name, source } of files) {
      expect(source, `${name} must not render iframes`).not.toMatch(
        /<iframe\b/i
      );
      expect(source, `${name} must not call raw fetch()`).not.toMatch(
        /\bfetch\s*\(/
      );
      expect(
        source,
        `${name} must not use useEffect for data fetching`
      ).not.toMatch(/\buseEffect\b/);
    }
  });

  it('scopes every TanStack Query key to accountId (and workspace.id for per-tab queries)', () => {
    const files = readPersonalToolsComponentSources();
    const queryFiles = files.filter(({ source }) =>
      /\buseQuery\s*\(/.test(source)
    );
    expect(queryFiles.length).toBe(4);
    for (const { name, source } of queryFiles) {
      expect(source, `${name} must include accountId in queryKey`).toMatch(
        /'meet-personal-tools',\s*accountId/
      );
      if (name !== 'personal-tools-panel.tsx') {
        expect(
          source,
          `${name} must include workspace.id in queryKey`
        ).toMatch(/'meet-personal-tools',\s*accountId,\s*workspace\.id/);
      }
    }
  });

  it('uses safe rel="noopener noreferrer" for external deep-links', () => {
    const shared = readPersonalToolsComponentSources().find(
      ({ name }) => name === 'personal-tools/shared.tsx'
    );
    expect(shared?.source).toContain('resolveLaunchableAppUrl');
    expect(shared?.source).toContain('rel="noopener noreferrer"');
  });

  it('is excluded from stage-layout, presence, Summon/Follow, Mira, and recordings', () => {
    const callDir = path.resolve(import.meta.dirname, '..');
    const isolatedPaths = [
      path.join(callDir, 'stage-layout', 'activity-ids.ts'),
      path.join(callDir, 'stage-layout', 'use-activity-presence.ts'),
      path.join(callDir, 'stage-layout', 'use-stage-navigation.ts'),
      path.join(callDir, 'stage-layout', 'use-stage-layout.ts'),
      path.resolve(callDir, '..', 'meeting-ai', 'meeting-ai-panel.tsx'),
    ];
    for (const filePath of isolatedPaths) {
      const source = readFileSync(filePath, 'utf8');
      expect(source, `${filePath} must not reference PersonalTools`).not.toMatch(
        /PersonalTools|meet-personal-tools|personal_tools|private_tools/
      );
    }
  });
});
