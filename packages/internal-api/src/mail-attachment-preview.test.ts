import { describe, expect, it, vi } from 'vitest';
import { getMailAttachmentText } from './mail-attachment-preview';

const path =
  '/api/v1/workspaces/ws/mail/mailboxes/box/messages/message/attachments/file';
const options = (response: Response) => ({
  baseUrl: 'https://mail.example.com',
  fetch: vi.fn().mockResolvedValue(response),
});
describe('plain text attachment loading', () => {
  it('loads plain text through the authenticated Mail client', async () => {
    const config = options(
      new Response('<script>plain text</script>', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    );
    expect(await getMailAttachmentText(path, undefined, config)).toBe(
      '<script>plain text</script>'
    );
    expect(config.fetch).toHaveBeenCalledWith(
      `https://mail.example.com${path}?preview=1`,
      expect.objectContaining({ credentials: 'include', cache: 'no-store' })
    );
  });
  it.each([401, 403, 404, 500])(
    'rejects HTTP %s rather than rendering error responses as text',
    async (status) => {
      await expect(
        getMailAttachmentText(
          path,
          undefined,
          options(new Response('failed', { status }))
        )
      ).rejects.toThrow('Attachment preview failed');
    }
  );
  it('rejects HTML and oversized text instead of displaying partial or active content', async () => {
    await expect(
      getMailAttachmentText(
        path,
        undefined,
        options(
          new Response('<html>', { headers: { 'content-type': 'text/html' } })
        )
      )
    ).rejects.toThrow('not plain text');
    await expect(
      getMailAttachmentText(
        path,
        undefined,
        options(
          new Response('partial', {
            status: 206,
            headers: {
              'content-type': 'text/plain',
              'content-range': 'bytes 0-1048575/2000000',
            },
          })
        )
      )
    ).rejects.toThrow('too large');
  });
  it('does not forward credentials to arbitrary URLs', async () => {
    const config = options(new Response('text'));
    await expect(
      getMailAttachmentText('https://example.com/file', undefined, config)
    ).rejects.toThrow('Invalid Mail attachment path');
    expect(config.fetch).not.toHaveBeenCalled();
  });
});
