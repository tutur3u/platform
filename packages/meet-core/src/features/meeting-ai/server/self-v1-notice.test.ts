import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ translations: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('next-intl/server', () => ({ getTranslations: mocks.translations }));

import {
  expectedSelfNoticeHash,
  requireShownSelfNotice,
  sha256Hex,
} from './self-v1-notice';

const text: Record<string, Record<string, string>> = {
  en: { self_body: 'Body', self_notice: 'Notice', self_readers: 'Readers' },
  vi: { self_body: 'Than', self_notice: 'Thong bao', self_readers: 'Doc' },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.translations.mockImplementation(
    async ({ locale, namespace }: { locale: string; namespace: string }) => {
      expect(namespace).toBe('meet.ai');
      return (key: string) => text[locale]![key]!;
    }
  );
});

describe('per-speaker notice evidence hash', () => {
  it('is the SHA-256 hex digest the client helper computes', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('hashes the three notice keys joined by newlines in that locale', async () => {
    expect(await expectedSelfNoticeHash('vi')).toBe(
      await sha256Hex('Than\nThong bao\nDoc')
    );
  });

  it('accepts the hash of the text shown in the stated locale', async () => {
    await expect(
      requireShownSelfNotice({
        locale: 'en',
        textHash: await sha256Hex('Body\nNotice\nReaders'),
      })
    ).resolves.toBeUndefined();
  });

  it.each([
    ['another locale text', 'vi', 'Body\nNotice\nReaders'],
    ['an unsupported locale', 'fr', 'Body\nNotice\nReaders'],
    ['an edited text', 'en', 'Body\nNotice'],
    ['the empty decline text', 'en', ''],
  ])('refuses %s', async (_label, locale, shown) => {
    await expect(
      requireShownSelfNotice({ locale, textHash: await sha256Hex(shown) })
    ).rejects.toMatchObject({
      status: 409,
      code: 'MEET_SELF_NOTICE_MISMATCH',
    });
  });
});

describe('missing notice text', () => {
  it.each([
    ['falls back to its key path', (key: string) => `meet.ai.${key}`],
    ['is empty', () => ''],
    [
      'throws',
      () => {
        throw new Error('missing');
      },
    ],
  ])('refuses Allow as unavailable when the text %s', async (_label, t) => {
    mocks.translations.mockResolvedValue(t);
    await expect(
      requireShownSelfNotice({ locale: 'en', textHash: 'a'.repeat(64) })
    ).rejects.toMatchObject({ status: 409, code: 'MEET_SELF_UNAVAILABLE' });
  });
});
