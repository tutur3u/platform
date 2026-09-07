import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deterministicUuid,
  normalizeGmailLabels,
  parseTakeoutMessage,
  readMboxMessages,
  slugifyGoogleLabel,
} from './google-takeout';

describe('Google Takeout mail import', () => {
  it('streams mbox messages and restores mboxrd From lines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mail-takeout-'));
    try {
      const path = join(dir, 'mail.mbox');
      await writeFile(
        path,
        [
          'From sender@example.com Sat Sep  5 11:11:11 +0000 2026\n',
          'Message-ID: <one@example.com>\n\n',
          '>From preserved body line\n',
          '>>From already quoted body line\n',
          'From sender@example.com Sun Sep  6 12:12:12 2026\n',
          'Message-ID: <two@example.com>\n\nSecond\n',
        ].join('')
      );

      const messages: string[] = [];
      for await (const raw of readMboxMessages(path)) {
        messages.push(raw.toString());
      }

      expect(messages).toHaveLength(2);
      expect(messages[0]).toContain('\nFrom preserved body line\n');
      expect(messages[0]).toContain('\n>From already quoted body line\n');
      expect(messages[1]).toContain('<two@example.com>');
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it('normalizes folded and repeated Gmail labels', () => {
    expect(
      normalizeGmailLabels([
        {
          key: 'x-gmail-labels',
          originalKey: 'X-Gmail-Labels',
          value: 'Inbox,Category\r\n Updates',
        },
        {
          key: 'x-gmail-labels',
          originalKey: 'X-Gmail-Labels',
          value: 'Starred, Inbox',
        },
      ])
    ).toEqual(['Inbox', 'Category Updates', 'Starred']);
  });

  it('preserves Gmail state and classifies deleted messages as trash', async () => {
    const raw = Buffer.from(
      [
        'From: Sender <sender@example.com>',
        'To: phucvo@tuturuuu.com',
        'Date: Sun, 6 Sep 2026 12:11:15 +0000',
        'Message-ID: <test@example.com>',
        'X-GM-THRID: 123456',
        'X-Gmail-Labels: Sent,Starred,Unread',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Hello',
      ].join('\r\n')
    );
    const parsed = await parseTakeoutMessage({
      account: 'phucvo@tuturuuu.com',
      deletedMbox: true,
      raw,
    });

    expect(parsed.gmailThreadId).toBe('123456');
    expect(parsed.direction).toBe('outbound');
    expect(parsed.status).toBe('sent');
    expect(parsed.isRead).toBe(false);
    expect(parsed.isStarred).toBe(true);
    expect(parsed.isTrashed).toBe(true);
    expect(parsed.systemLabelSlugs).toEqual(
      expect.arrayContaining(['sent', 'starred', 'trash'])
    );
  });

  it('creates stable RFC 4122 version 5-shaped IDs', () => {
    const first = deterministicUuid('message', 'same');
    expect(first).toBe(deterministicUuid('message', 'same'));
    expect(first).not.toBe(deterministicUuid('message', 'different'));
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );
  });

  it('creates nonempty collision-safe slugs for international labels', () => {
    expect(slugifyGoogleLabel('安全')).toMatch(/^label-[0-9a-f]{10}$/u);
    expect(slugifyGoogleLabel('Résumé')).not.toBe(slugifyGoogleLabel('Resume'));
    expect(slugifyGoogleLabel('Résumé')).toBe(slugifyGoogleLabel('Résumé'));
  });
});
