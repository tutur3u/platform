import { describe, expect, it } from 'vitest';
import {
  matchesChatConversationQuery,
  normalizeChatSearchText,
  readChatConversationSearchQuery,
} from './conversation-search';

const member = (userId: string, displayName: string, handle?: string) => ({
  user: { avatarUrl: null, displayName, handle: handle ?? null, id: userId },
  userId,
});

const conversation = (
  title: string | null,
  members: ReturnType<typeof member>[]
) => ({ members, title }) as never;

describe('conversation search', () => {
  it('folds case, accents and Vietnamese đ', () => {
    expect(normalizeChatSearchText('  Đặng  Thị LĨNH ')).toBe('dang thi linh');
  });

  it('matches titles and other members by name or handle', () => {
    const design = conversation('Design Review', [
      member('me', 'Minh Tran'),
      member('ada', 'Ada Lovelace', 'ada.l'),
    ]);
    expect(matchesChatConversationQuery(design, 'review', 'me')).toBe(true);
    expect(matchesChatConversationQuery(design, 'lovelace', 'me')).toBe(true);
    expect(matchesChatConversationQuery(design, 'ada.l', 'me')).toBe(true);
    expect(matchesChatConversationQuery(design, 'grace', 'me')).toBe(false);
  });

  it("never matches on the viewer's own name", () => {
    const direct = conversation(null, [
      member('me', 'Minh Tran'),
      member('ada', 'Ada Lovelace'),
    ]);
    expect(matchesChatConversationQuery(direct, 'minh', 'me')).toBe(false);
  });

  it('reads q: blank lists, short or long queries are rejected', () => {
    const read = (q: string | null) =>
      readChatConversationSearchQuery(
        new URL(
          `http://localhost/x${q === null ? '' : `?q=${encodeURIComponent(q)}`}`
        )
      );
    expect(read(null)).toEqual({ ok: true, query: null });
    expect(read('   ')).toEqual({ ok: true, query: null });
    expect(read('Li')).toEqual({ ok: true, query: 'li' });
    expect(read('a')).toMatchObject({
      code: 'chat_search_query_too_short',
      ok: false,
    });
    expect(read('x'.repeat(101))).toMatchObject({
      code: 'chat_search_query_too_long',
      ok: false,
    });
  });
});
