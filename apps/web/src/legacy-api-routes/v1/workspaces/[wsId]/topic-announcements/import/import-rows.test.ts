import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('../server-helpers', () => ({
  attachTopicAnnouncementGroups: vi.fn(),
  getPrivateSchemaClient: vi.fn((client) => client),
  getPublicSchemaClient: vi.fn((client) => client),
  insertTopicAnnouncementAttachmentDrafts: vi.fn(),
  mapTopicAnnouncementRow: vi.fn(),
  resolveTopicAnnouncementsAccess: vi.fn(),
  serializeTopicAnnouncementAttachment: vi.fn(),
  serializeTopicAnnouncementContact: vi.fn(),
  serializeTopicAnnouncementContacts: vi.fn(),
}));

import { TopicAnnouncementImportSchema } from '../shared';
import {
  normalizeImportRows,
  normalizeImportTime,
  validateImportTeacherIds,
} from './import-rows';

const TEACHER_A = '00000000-0000-4000-8000-00000000000a';
const TEACHER_B = '00000000-0000-4000-8000-00000000000b';

function workspaceUsersClient(rows: { id: string }[]) {
  const calls: { column: string; method: string; value: unknown }[] = [];
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      calls.push({ column, method: 'eq', value });
      return query;
    }),
    in: vi.fn((column: string, value: unknown) => {
      calls.push({ column, method: 'in', value });
      return Promise.resolve({ data: rows, error: null });
    }),
    select: vi.fn(() => query),
  };
  return { calls, client: { from: vi.fn(() => query) } };
}

describe('normalizeImportRows', () => {
  it('creates topic-less rows as drafts with a schedule title', () => {
    const { rowErrors, validRows } = normalizeImportRows([
      {
        classLabel: 'K1A',
        contactEmail: 'Teacher@Example.com',
        endTime: '18:00',
        sessionDate: '2026-10-05',
        startTime: '17:30',
        teacherWorkspaceUserId: TEACHER_A,
      },
    ]);

    expect(rowErrors).toEqual([]);
    expect(validRows).toEqual([
      {
        classLabel: 'K1A',
        contactEmail: 'teacher@example.com',
        contactName: 'teacher@example.com',
        dayLabel: null,
        endTime: '18:00:00',
        place: null,
        room: null,
        rowNumber: 1,
        sessionDate: '2026-10-05',
        startTime: '17:30:00',
        teacherWorkspaceUserId: TEACHER_A,
        title: 'K1A 2026-10-05 17:30',
        topic: null,
      },
    ]);
  });

  it('keeps the topic-based title when a topic exists', () => {
    const { validRows } = normalizeImportRows([
      { contactEmail: 'a@example.com', topic: 'Unit 3 speaking' },
    ]);
    expect(validRows[0]).toMatchObject({
      teacherWorkspaceUserId: null,
      title: 'Unit 3 speaking',
      topic: 'Unit 3 speaking',
    });
  });

  it('returns row errors for missing contacts, bad times and empty rows', () => {
    const { rowErrors, validRows } = normalizeImportRows([
      { topic: 'No email' },
      { contactEmail: 'a@example.com', startTime: '25:00', topic: 'Late' },
      { contactEmail: 'b@example.com', endTime: 'soon', topic: 'Odd' },
      { contactEmail: 'c@example.com' },
    ]);

    expect(validRows).toEqual([]);
    expect(rowErrors).toEqual([
      { message: 'Missing contact email', rowNumber: 1 },
      { message: 'Invalid start time', rowNumber: 2 },
      { message: 'Invalid end time', rowNumber: 3 },
      { message: 'Missing topic or title', rowNumber: 4 },
    ]);
  });

  it('accepts AM/PM times', () => {
    expect(normalizeImportTime('5:30 PM')).toBe('17:30:00');
    expect(normalizeImportTime('12:00 AM')).toBe('00:00:00');
    expect(normalizeImportTime('13:00 PM')).toBeNull();
  });
});

describe('TopicAnnouncementImportSchema', () => {
  it('accepts an optional teacher id and rejects malformed ids', () => {
    expect(
      TopicAnnouncementImportSchema.safeParse({
        rows: [
          { contactEmail: 'a@example.com', teacherWorkspaceUserId: TEACHER_A },
        ],
      }).success
    ).toBe(true);
    expect(
      TopicAnnouncementImportSchema.safeParse({
        rows: [{ contactEmail: 'a@example.com', teacherWorkspaceUserId: 'x' }],
      }).success
    ).toBe(false);
  });
});

describe('validateImportTeacherIds', () => {
  it('skips the lookup when no row has a teacher', async () => {
    const { client } = workspaceUsersClient([]);
    await expect(
      validateImportTeacherIds({
        normalizedWsId: 'ws-1',
        rows: [{ rowNumber: 1, teacherWorkspaceUserId: null }],
        sbAdmin: client,
      })
    ).resolves.toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('accepts teachers that belong to the workspace', async () => {
    const { calls, client } = workspaceUsersClient([{ id: TEACHER_A }]);
    await expect(
      validateImportTeacherIds({
        normalizedWsId: 'ws-1',
        rows: [
          { rowNumber: 1, teacherWorkspaceUserId: TEACHER_A },
          { rowNumber: 2, teacherWorkspaceUserId: TEACHER_A },
        ],
        sbAdmin: client,
      })
    ).resolves.toBeNull();
    expect(client.from).toHaveBeenCalledWith('workspace_users');
    expect(calls).toEqual([
      { column: 'ws_id', method: 'eq', value: 'ws-1' },
      { column: 'id', method: 'in', value: [TEACHER_A] },
    ]);
  });

  it('returns 400 with row numbers for teachers outside the workspace', async () => {
    const { client } = workspaceUsersClient([{ id: TEACHER_A }]);
    const response = await validateImportTeacherIds({
      normalizedWsId: 'ws-1',
      rows: [
        { rowNumber: 1, teacherWorkspaceUserId: TEACHER_A },
        { rowNumber: 2, teacherWorkspaceUserId: TEACHER_B },
      ],
      sbAdmin: client,
    });

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      message: 'Teacher is not a workspace user of this workspace',
      rowNumbers: [2],
    });
  });
});
