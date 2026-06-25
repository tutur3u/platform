import { describe, expect, it } from 'vitest';
import {
  parseTopicAnnouncementCsv,
  parseTopicAnnouncementRowsFromMatrix,
  validateTopicAnnouncementImportRows,
} from './import-utils';

describe('parseTopicAnnouncementCsv', () => {
  it('maps foreign-teacher schedule headers into topic announcement rows', () => {
    const rows = parseTopicAnnouncementCsv(
      'DAY,class,ROOM,TIME,TEACHER,email,PLACE,topic\nSaturday,EGET1,6,04:30 PM,Mrs Sana,sana@example.com,CENTER 1,Unit 3 speaking'
    );

    expect(rows).toEqual([
      {
        classLabel: 'EGET1',
        contactEmail: 'sana@example.com',
        contactName: 'Mrs Sana',
        dayLabel: 'Saturday',
        place: 'CENTER 1',
        room: '6',
        startTime: '04:30 PM',
        title: 'Unit 3 speaking',
        topic: 'Unit 3 speaking',
      },
    ]);
  });

  it('handles quoted commas and email-only contact cells', () => {
    const rows = parseTopicAnnouncementCsv(
      'teacher,topic\n"teacher@example.com","Pronunciation, review"'
    );

    expect(rows[0]).toMatchObject({
      contactEmail: 'teacher@example.com',
      contactName: 'teacher@example.com',
      topic: 'Pronunciation, review',
    });
  });

  it('maps filled spreadsheet rows with Vietnamese headers and skips empty rows', () => {
    const rows = parseTopicAnnouncementRowsFromMatrix([
      [
        'Ngày',
        'Lớp',
        'Phòng',
        'Giờ bắt đầu',
        'Giờ kết thúc',
        'Giáo viên',
        'Email',
        'Địa điểm',
        'Chủ đề',
        'Tiêu đề',
      ],
      ['', '', '', '', '', '', '', '', '', ''],
      [
        '2026-06-01',
        'EGET2',
        'B201',
        '17:00',
        '18:00',
        'Cô Linh',
        'linh@example.com',
        'Cơ sở 2',
        'Ôn tập nói',
        '',
      ],
    ]);

    expect(rows).toEqual([
      {
        classLabel: 'EGET2',
        contactEmail: 'linh@example.com',
        contactName: 'Cô Linh',
        endTime: '18:00',
        place: 'Cơ sở 2',
        room: 'B201',
        sessionDate: '2026-06-01',
        startTime: '17:00',
        title: 'Ôn tập nói',
        topic: 'Ôn tập nói',
      },
    ]);
  });

  it('reports preview validation errors without dropping usable rows', () => {
    const preview = validateTopicAnnouncementImportRows([
      {
        contactEmail: 'ready@example.com',
        sessionDate: '2026-06-01',
        topic: 'Ready topic',
      },
      { contactName: 'Missing email', topic: 'Needs email' },
      { contactEmail: 'missing-topic@example.com' },
      { contactEmail: 'not-an-email', topic: 'Bad email' },
      {
        contactEmail: 'bad-date@example.com',
        sessionDate: '06/01/2026',
        topic: 'Bad date',
      },
    ]);

    expect(preview).toEqual([
      {
        errors: [],
        row: {
          contactEmail: 'ready@example.com',
          sessionDate: '2026-06-01',
          topic: 'Ready topic',
        },
        rowNumber: 1,
      },
      {
        errors: ['missing_email'],
        row: { contactName: 'Missing email', topic: 'Needs email' },
        rowNumber: 2,
      },
      {
        errors: ['missing_topic'],
        row: { contactEmail: 'missing-topic@example.com' },
        rowNumber: 3,
      },
      {
        errors: ['invalid_email'],
        row: { contactEmail: 'not-an-email', topic: 'Bad email' },
        rowNumber: 4,
      },
      {
        errors: ['invalid_date'],
        row: {
          contactEmail: 'bad-date@example.com',
          sessionDate: '06/01/2026',
          topic: 'Bad date',
        },
        rowNumber: 5,
      },
    ]);
  });
});
