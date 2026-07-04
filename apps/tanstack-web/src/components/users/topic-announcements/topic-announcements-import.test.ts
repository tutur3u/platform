import { describe, expect, it } from 'vitest';
import { parseTopicAnnouncementCsv } from './import-utils';
import {
  BULK_SEND_LIMIT,
  buildImportPayload,
  getImportPanelRowState,
  IMPORT_ROWS_LIMIT,
} from './topic-announcements-import';

describe('topic announcement import payloads', () => {
  it('builds draft-import payloads from valid edited rows', () => {
    const rows = [
      {
        contactEmail: 'ready@example.com',
        title: 'Ready title',
        topic: 'Ready topic',
      },
      {
        contactEmail: 'missing-topic@example.com',
      },
      {
        contactName: 'Missing email',
        topic: 'Needs email',
      },
    ];
    const state = getImportPanelRowState(rows);

    expect(state.invalidCount).toBe(2);
    expect(state.validRows).toEqual([
      {
        contactEmail: 'ready@example.com',
        title: 'Ready title',
        topic: 'Ready topic',
      },
    ]);
    expect(buildImportPayload(state.validRows, '  ')).toEqual({
      rows: [
        {
          contactEmail: 'ready@example.com',
          title: 'Ready title',
          topic: 'Ready topic',
        },
      ],
      sourceName: undefined,
      sourceType: 'foreign_teacher_schedule',
    });
  });

  it('loads CSV rows into the same create-and-send payload shape', () => {
    const rows = parseTopicAnnouncementCsv(
      [
        'email,topic,title',
        'ready@example.com,Ready topic,Ready title',
        'missing-topic@example.com,,Missing topic title',
        ',Needs email,Missing email title',
      ].join('\n')
    );
    const state = getImportPanelRowState(rows);

    expect(state.invalidCount).toBe(2);
    expect(buildImportPayload(state.validRows, 'June schedule')).toEqual({
      rows: [
        {
          contactEmail: 'ready@example.com',
          title: 'Ready title',
          topic: 'Ready topic',
        },
      ],
      sourceName: 'June schedule',
      sourceType: 'foreign_teacher_schedule',
    });
  });

  it('normalizes submitted row and source-name values like the API boundary', () => {
    expect(
      buildImportPayload(
        [
          {
            contactEmail: '  READY@EXAMPLE.COM ',
            sessionDate: ' 2026-06-01 ',
            topic: '  Ready topic ',
          },
        ],
        '  June schedule '
      )
    ).toEqual({
      rows: [
        {
          contactEmail: 'ready@example.com',
          sessionDate: '2026-06-01',
          topic: 'Ready topic',
        },
      ],
      sourceName: 'June schedule',
      sourceType: 'foreign_teacher_schedule',
    });
  });

  it('flags create-and-send batches above the legacy bulk send limit', () => {
    const state = getImportPanelRowState(
      Array.from({ length: BULK_SEND_LIMIT + 1 }, (_, index) => ({
        contactEmail: `ready-${index}@example.com`,
        topic: `Ready topic ${index}`,
      }))
    );

    expect(state.validRows).toHaveLength(BULK_SEND_LIMIT + 1);
    expect(state.sendTooLarge).toBe(true);
  });

  it('flags import batches above the API import row limit', () => {
    const state = getImportPanelRowState(
      Array.from({ length: IMPORT_ROWS_LIMIT + 1 }, (_, index) => ({
        contactEmail: `ready-${index}@example.com`,
        topic: `Ready topic ${index}`,
      }))
    );

    expect(state.validRows).toHaveLength(IMPORT_ROWS_LIMIT + 1);
    expect(state.tooManyRows).toBe(true);
  });
});
