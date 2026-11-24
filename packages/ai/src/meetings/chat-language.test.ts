import { describe, expect, it } from 'vitest';
import {
  conversationLanguage,
  meetReplyLanguage,
  messageLanguage,
} from './chat-language';

const chat = (...bodies: string[]) =>
  bodies.map((body) => ({ body, displayName: 'Guest' }));

describe('messageLanguage', () => {
  it('recognizes English and Vietnamese', () => {
    expect(messageLanguage('Let us ship the release on Friday')).toBe(
      'English'
    );
    expect(messageLanguage('hello everyone')).toBe('English');
    expect(messageLanguage('Mình sẽ gửi bản nháp vào thứ Sáu')).toBe(
      'Vietnamese'
    );
  });

  it('keeps loanwords and other Latin languages out of Vietnamese', () => {
    expect(messageLanguage('Please send your résumé to the team')).toBe(
      'English'
    );
    expect(messageLanguage('Let us meet at the café')).toBe('English');
    expect(messageLanguage('Đức, can you share the deck with us?')).toBe(
      'English'
    );
    expect(messageLanguage('À bientôt, très bien')).toBeUndefined();
  });

  it('does not read Vietnamese typed without marks as English', () => {
    expect(messageLanguage('ok minh di an com a')).toBeUndefined();
    expect(messageLanguage('anh gui to nha')).toBeUndefined();
    expect(messageLanguage('co the on roi')).toBeUndefined();
  });

  it('leaves short, link-only or unclear text', () => {
    expect(messageLanguage('agreed')).toBeUndefined();
    expect(messageLanguage('https://example.com/a-b-c')).toBeUndefined();
    expect(messageLanguage('Bonjour tout le monde')).toBeUndefined();
  });
});

describe('conversationLanguage', () => {
  it('follows what people write, not Mira entries or requests to Mira', () => {
    expect(
      conversationLanguage([
        ...chat(
          'We agreed to move the launch to Friday',
          '@mira Tóm tắt cuộc họp đến thời điểm này.',
          'Nhờ @ttr liệt kê công việc cần làm'
        ),
        { body: 'Cuộc họp đã thống nhất dời ngày ra mắt.', assistant: true },
        { body: 'Nhóm sẽ gửi email cho mọi người.', assistant: true },
      ])
    ).toBe('English');
  });

  it('needs a 60% share of the clear messages', () => {
    expect(conversationLanguage([])).toBeUndefined();
    expect(
      conversationLanguage(
        chat('What is the plan for this week?', 'Mình chưa xem tài liệu này')
      )
    ).toBeUndefined();
    expect(
      conversationLanguage(
        chat(
          'Mình chưa xem tài liệu này',
          'Chúng ta chốt ngày nào?',
          'What is the plan for this week?'
        )
      )
    ).toBe('Vietnamese');
  });
});

describe('meetReplyLanguage', () => {
  const englishRoom = chat('hello everyone', 'sounds good');

  it('keeps every quick action in the conversation language', () => {
    for (const prompt of [
      'Tóm tắt cuộc họp đến thời điểm này.',
      'Chúng ta đã quyết định những gì và còn vấn đề nào chưa giải quyết?',
      'Liệt kê công việc cần làm, người phụ trách và hạn chót được nhắc đến trong cuộc họp.',
    ]) {
      expect(meetReplyLanguage(englishRoom, prompt, 'vi')).toBe('English');
      expect(meetReplyLanguage(englishRoom.slice(0, 1), prompt, 'vi')).toBe(
        'English'
      );
    }
  });

  it('falls back to the question, then the requester UI locale', () => {
    expect(meetReplyLanguage([], 'What did we decide?', 'vi')).toBe('English');
    expect(meetReplyLanguage([], '?', 'vi')).toBe('Vietnamese');
    expect(meetReplyLanguage([], '?', 'en-US')).toBe('English');
    expect(meetReplyLanguage([], '?', 'fr')).toBeUndefined();
    expect(meetReplyLanguage([], '?')).toBeUndefined();
  });
});
