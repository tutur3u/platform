import { describe, expect, it } from 'vitest';
import { classesMapping, classSessionsMapping } from './module-mappings';
import { generateModules } from './modules';
import { getItemKey } from './utils/reconciliation';

describe('migration schedule mappings', () => {
  it('strips legacy sessions from class group rows', () => {
    const [group] = classesMapping('ws-1', [
      {
        id: 'group-1',
        code: 'A1',
        sessions: ['2026-01-12'],
        status: 'ACTIVE',
      },
    ]);

    expect(group).toMatchObject({
      id: 'group-1',
      name: 'A1',
      ws_id: 'ws-1',
    });
    expect(group).not.toHaveProperty('sessions');
  });

  it('maps legacy class dates to 7AM-8AM GMT+7 sessions', () => {
    const sessions = classSessionsMapping('ws-1', [
      {
        id: 'group-1',
        code: 'A1',
        sessions: ['2026-01-12', '2026-01-13T12:30:00.000Z'],
      },
    ]);

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      ws_id: 'ws-1',
      group_id: 'group-1',
      starts_at: '2026-01-12T00:00:00.000Z',
      ends_at: '2026-01-12T01:00:00.000Z',
      start_timezone: 'Asia/Ho_Chi_Minh',
      end_timezone: 'Asia/Ho_Chi_Minh',
      source: 'legacy_classes.sessions',
      source_legacy_date: '2026-01-12',
    });
    expect(sessions[0]?.id).toBe(
      classSessionsMapping('ws-1', [
        { id: 'group-1', sessions: ['2026-01-12'] },
      ])[0]?.id
    );
  });

  it('orders groups before schedules and schedules before attendance/invoices', () => {
    const modules = generateModules().map((item) => item.module);

    expect(modules.indexOf('classes')).toBeLessThan(
      modules.indexOf('class-sessions')
    );
    expect(modules.indexOf('class-sessions')).toBeLessThan(
      modules.indexOf('class-attendance')
    );
    expect(modules.indexOf('workspace-user-groups')).toBeLessThan(
      modules.indexOf('workspace-user-group-session-series')
    );
    expect(modules.indexOf('workspace-user-group-sessions')).toBeLessThan(
      modules.indexOf('finance-invoice-user-groups')
    );
  });

  it('marks legacy and Tuturuuu schedule modules for the correct mode', () => {
    const modules = generateModules();

    expect(
      modules.find((item) => item.module === 'class-sessions')
    ).toMatchObject({ legacyOnly: true });
    expect(
      modules.find(
        (item) => item.module === 'workspace-user-group-session-series'
      )
    ).toMatchObject({ tuturuuuOnly: true });
    expect(
      modules.find((item) => item.module === 'workspace-user-group-sessions')
    ).toMatchObject({ tuturuuuOnly: true });
  });

  it('uses schedule reconciliation keys', () => {
    expect(
      getItemKey('class-sessions', {
        group_id: 'group-1',
        id: 'ignored',
        source_legacy_date: '2026-01-12',
      })
    ).toBe('group-1|2026-01-12');
    expect(
      getItemKey('workspace-user-group-session-tag-links', {
        session_id: 'session-1',
        tag_id: 'tag-1',
      })
    ).toBe('session-1|tag-1');
    expect(
      getItemKey('workspace-user-group-session-files', {
        session_id: 'session-1',
        storage_path: 'user-groups/group-1/file.pdf',
      })
    ).toBe('session-1|user-groups/group-1/file.pdf');
  });
});
