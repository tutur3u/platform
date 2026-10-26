import { describe, expect, it } from 'vitest';
import { previewImportRow, previewImportRows } from './import-row-preview';
import {
  matchContactByName,
  matchWorkspaceUser,
} from './teacher-schedule-matching';

// Synthetic workspace users and contacts.
const users = [
  {
    display_name: null,
    email: 'mai@example.com',
    full_name: 'Trần Mai',
    id: 'u-mai',
  },
  { display_name: 'Bao', email: null, full_name: 'Lê Bảo', id: 'u-bao-1' },
  { display_name: null, email: null, full_name: 'Le Bao', id: 'u-bao-2' },
  {
    archived: true,
    display_name: null,
    email: null,
    full_name: 'Old Teacher',
    id: 'u-old',
  },
];

const contacts = [
  { archived: false, email: 'alex.rivers@example.com', name: 'Alex Rivers' },
  { archived: false, email: 'sam.one@example.com', name: 'Sam Lee' },
  { archived: false, email: 'sam.two@example.com', name: 'Sam Lee' },
  { archived: true, email: 'gone@example.com', name: 'Gone Teacher' },
];

describe('teacher schedule matching', () => {
  it('matches workspace users by exact or diacritic-insensitive name and email', () => {
    expect(matchWorkspaceUser('trần mai', users)).toMatchObject({
      kind: 'matched',
      value: { id: 'u-mai' },
    });
    expect(matchWorkspaceUser('Tran Mai', users)).toMatchObject({
      kind: 'matched',
      value: { id: 'u-mai' },
    });
    expect(matchWorkspaceUser('MAI@example.com', users)).toMatchObject({
      kind: 'matched',
      value: { id: 'u-mai' },
    });
  });

  it('prefers a single exact match over looser diacritic matches', () => {
    expect(matchWorkspaceUser('Lê Bảo', users)).toMatchObject({
      kind: 'matched',
      value: { id: 'u-bao-1' },
    });
  });

  it('reports ambiguous and unmatched names, ignoring archived users', () => {
    expect(matchWorkspaceUser('Le  Bao ', users)).toMatchObject({
      kind: 'matched',
      value: { id: 'u-bao-2' },
    });
    expect(matchWorkspaceUser('le bảo', users)).toEqual({ kind: 'ambiguous' });
    expect(matchWorkspaceUser('Old Teacher', users)).toEqual({
      kind: 'unmatched',
    });
    expect(matchWorkspaceUser('   ', users)).toEqual({ kind: 'unmatched' });
  });

  it('matches contacts by name and flags duplicates', () => {
    expect(matchContactByName('alex rivers', contacts)).toMatchObject({
      kind: 'matched',
      value: { email: 'alex.rivers@example.com' },
    });
    expect(matchContactByName('Sam Lee', contacts)).toEqual({
      kind: 'ambiguous',
    });
    expect(matchContactByName('Gone Teacher', contacts)).toEqual({
      kind: 'unmatched',
    });
  });
});

describe('previewImportRow', () => {
  const context = { contacts, requireSchedule: true, workspaceUsers: users };

  it('resolves the teacher and contact into a submit row', () => {
    const preview = previewImportRow(
      {
        classLabel: 'K1A',
        contactName: 'Alex Rivers',
        endTime: '18:00',
        sessionDate: '2026-10-05',
        startTime: '5:30 PM',
        teacherName: 'Tran Mai',
      },
      1,
      context
    );

    expect(preview.errors).toEqual([]);
    expect(preview.warnings).toEqual(['missing_topic']);
    expect(preview.submitRow).toEqual({
      classLabel: 'K1A',
      contactEmail: 'alex.rivers@example.com',
      contactName: 'Alex Rivers',
      endTime: '18:00',
      sessionDate: '2026-10-05',
      startTime: '17:30',
      teacherWorkspaceUserId: 'u-mai',
    });
  });

  it('reports every row error and withholds the submit row', () => {
    const preview = previewImportRow(
      {
        contactName: 'Sam Lee',
        sessionDate: '31/2/2026',
        startTime: '25:00',
        teacherName: 'Nobody Here',
      },
      2,
      context
    );

    expect(preview.errors).toEqual([
      'ambiguous_contact',
      'unmatched_teacher',
      'bad_date',
      'bad_time',
    ]);
    expect(preview.submitRow).toBeUndefined();
  });

  it('requires a date and start time only for teacher schedule imports', () => {
    const row = { contactEmail: 'a@example.com', topic: 'Unit 1' };
    expect(previewImportRow(row, 1, context).errors).toEqual([
      'missing_date',
      'missing_time',
    ]);
    expect(previewImportRow(row, 1).errors).toEqual([]);
  });

  it('requires an end time for teacher schedule rows', () => {
    const row = {
      contactEmail: 'a@example.com',
      sessionDate: '2026-10-05',
      startTime: '23:45',
    };
    expect(previewImportRow(row, 1, context).errors).toEqual(['bad_time']);
    expect(previewImportRow(row, 1).errors).toEqual([]);
  });

  it('flags unknown contacts and missing contact details', () => {
    expect(
      previewImportRow({ contactName: 'Unknown Person' }, 1).errors
    ).toEqual(['unknown_contact']);
    expect(previewImportRow({ topic: 'Unit 1' }, 1).errors).toEqual([
      'missing_email',
    ]);
  });

  it('skips empty rows and numbers rows from one', () => {
    const previews = previewImportRows([{}, { classLabel: 'K1A' }]);
    expect(previews[0]).toEqual({
      errors: [],
      row: {},
      rowNumber: 1,
      warnings: [],
    });
    expect(previews[1]?.rowNumber).toBe(2);
  });
});
