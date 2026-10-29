import { expect } from '@playwright/test';
import { z } from 'zod';
import {
  config,
  input,
  readJson,
  segment,
  signIn,
  test,
  workspacePath,
} from './fixtures';

const message = z.object({
  id: z.string(),
  subject: z.string(),
  direction: z.string(),
  internetMessageId: z.string(),
  receivedAt: z.string(),
  unread: z.boolean(),
  attachments: z.array(z.object({ id: z.string(), filename: z.string() })),
});

test('provider reads, previously delivered webhook message and attachment bytes are read-only', async ({
  page,
  acceptanceLocale,
}) => {
  await signIn(page, acceptanceLocale, `${workspacePath}/inbox`);
  const prefix = `/api/v1/workspaces/${segment(config.workspace)}/mail`;
  const accounts = z
    .array(z.object({ id: z.string(), provider: z.string() }))
    .parse(await readJson(page, `${prefix}/connected`));
  expect(accounts).toContainEqual(
    expect.objectContaining({
      id: input('MAIL_ACCOUNT_ID'),
      provider: input('MAIL_PROVIDER'),
    })
  );
  const providerMessage = z
    .object({ id: z.string(), subject: z.string() })
    .parse(
      await readJson(
        page,
        `${prefix}/connected/${segment(input('MAIL_ACCOUNT_ID'))}/messages/${segment(input('MAIL_PROVIDER_MESSAGE_ID'))}`
      )
    );
  expect(providerMessage.subject).toBe(input('MAIL_PROVIDER_SUBJECT'));
  const path = `${prefix}/mailboxes/${segment(input('MAIL_MAILBOX_ID'))}/messages/${segment(input('MAIL_WEBHOOK_MESSAGE_ID'))}`;
  const before = message.parse(await readJson(page, path));
  expect(before.subject).toBe(input('MAIL_WEBHOOK_SUBJECT'));
  expect(before.internetMessageId).toBe(
    input('MAIL_WEBHOOK_INTERNET_MESSAGE_ID')
  );
  expect(before.direction).toBe('inbound');
  expect(Date.parse(before.receivedAt)).toBeGreaterThanOrEqual(
    Date.parse(input('MAIL_WEBHOOK_NOT_BEFORE'))
  );
  expect(before.attachments).toContainEqual(
    expect.objectContaining({
      id: input('MAIL_ATTACHMENT_ID'),
      filename: input('MAIL_ATTACHMENT_FILENAME'),
    })
  );
  // Fetch the authenticated app attachment proxy, never a raw R2/signed URL.
  const digest = await page.evaluate(
    async (path) => {
      const response = await fetch(path, {
        credentials: 'include',
        redirect: 'error',
      });
      if (
        !response.ok ||
        Number(response.headers.get('content-length')) > 1024 * 1024
      )
        throw new Error('Attachment acceptance requires <=1 MiB fixture');
      if (!response.body) throw new Error('Attachment body missing');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 1024 * 1024)
            throw new Error('Attachment fixture exceeded limit');
          chunks.push(next.value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return {
        size: bytes.byteLength,
        sha256: Array.from(new Uint8Array(hash), (byte) =>
          byte.toString(16).padStart(2, '0')
        ).join(''),
      };
    },
    `${path}/attachments/${segment(input('MAIL_ATTACHMENT_ID'))}?preview=1`
  );
  expect(digest.size).toBeGreaterThan(0);
  expect(digest.sha256).toBe(input('MAIL_ATTACHMENT_SHA256'));
  const after = message.parse(await readJson(page, path));
  expect(after).toEqual(before);
  await expect(page.locator('[data-workspace-slug]')).toBeVisible();
});
