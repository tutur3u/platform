import { describe, expect, it } from 'vitest';
import { parseTopicAnnouncementCsv } from './import-utils';

describe('parseTopicAnnouncementCsv', () => {
  it('maps foreign-teacher schedule headers into topic announcement rows', () => {
    const rows = parseTopicAnnouncementCsv(
      'DAY,LỚP,ROOM,TIME,TEACHER,email,PLACE,topic\nSaturday,HƯỚNG-EGET1,6,04:30 PM,Mrs Sana,sana@example.com,CENTER 1,Unit 3 speaking'
    );

    expect(rows).toEqual([
      {
        classLabel: 'HƯỚNG-EGET1',
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
});
