import { readFileSync } from 'node:fs';
import type { MailAttachment } from '@tuturuuu/internal-api';
import PostalMime from 'postal-mime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMailMessagePreviewDocument } from '../../app/[locale]/(dashboard)/[wsId]/mail-message-preview-utils';
import { sanitizeMailHtml } from './html';
import {
  buildMailInlineImages,
  replaceMailInlineAttachmentUrls,
} from './inline-images';

const protectedUrl =
  '/api/v1/workspaces/ws/mail/mailboxes/box/messages/message/attachments/image';
const attachment: MailAttachment = {
  id: 'image',
  contentId: '<image001@EXAMPLE.test>',
  contentType: 'image/png; name="image.png"',
  disposition: 'inline',
  filename: 'image.png',
  protectedUrl,
  sizeBytes: 68,
};

afterEach(() => vi.unstubAllGlobals());

describe('inline MIME images', () => {
  it.each(['', '/mail'])(
    'renders multipart/related through the protected route at %j',
    async (base) => {
      vi.stubGlobal('__tuturuuuAppBase', base);
      const raw = readFileSync(
        new URL('./fixtures/inline-related.eml', import.meta.url)
      );
      const parsed = await PostalMime.parse(raw);
      expect(parsed.attachments).toHaveLength(1);
      const part = parsed.attachments[0]!;
      const images = buildMailInlineImages([
        {
          ...attachment,
          contentId: part.contentId ?? null,
          contentType: part.mimeType,
        },
      ]);
      const document = buildMailMessagePreviewDocument(
        parsed.html!,
        'original',
        images
      );
      expect(document).toContain(`src="${base}${protectedUrl}?preview=1"`);
      expect(document).not.toMatch(/src="cid:/iu);
      expect(document).toContain("script-src 'none'");
      expect(document).toContain('img-src https: http: cid:');
    }
  );

  it.each(['image001@example.test', '<IMAGE001@EXAMPLE.TEST>'])(
    'matches Content-ID %s with MIME parameters',
    (contentId) => {
      const images = buildMailInlineImages([{ ...attachment, contentId }]);
      expect(
        sanitizeMailHtml('<img src="cid:image001@example.test">', {
          inlineImages: images,
        })
      ).toContain(`src="${protectedUrl}?preview=1"`);
    }
  );

  it('does not resolve missing parts, malformed escapes or non-image attachments', () => {
    const images = buildMailInlineImages([
      { ...attachment, contentType: 'image/svg+xml' },
      { ...attachment, contentId: 'missing', protectedUrl: null },
    ]);
    expect(images).toEqual({});
    const html = sanitizeMailHtml(
      '<img src="cid:unknown"><img src="cid:%ZZ">',
      { inlineImages: images }
    );
    expect(html).not.toContain('/api/');
  });

  it('does not replace CID references with public URLs', () => {
    const html = sanitizeMailHtml('<img src="cid:image">', {
      inlineImages: { image: 'https://public.example.test/image.png' },
    });
    expect(html).not.toContain('public.example.test');
  });

  it('recovers delivered messages with a draft path prepended to the CID', () => {
    const images = buildMailInlineImages([attachment]);
    const html = sanitizeMailHtml(
      '<img src="/api/v1/workspaces/personal/mail/mailboxes/sender/drafts/draft-idcid:IMAGE001@example.test">',
      { inlineImages: images }
    );
    expect(html).toContain(`src="${protectedUrl}?preview=1"`);
    expect(html).not.toContain('/drafts/');
  });

  it.each(['', '/mail', 'https://mail.example.test'])(
    'converts the entire outgoing attachment URL at %j',
    (base) => {
      const url = `${base}/api/v1/workspaces/ws/mail/mailboxes/box/drafts/draft/attachments/image`;
      const html = replaceMailInlineAttachmentUrls(
        `<p>Body</p><img src="${url}"><img src="cid:external">`,
        [attachment]
      );
      expect(html).toBe(
        '<p>Body</p><img src="cid:image001%40EXAMPLE.test"><img src="cid:external">'
      );
      const rendered = sanitizeMailHtml(html, {
        inlineImages: buildMailInlineImages([attachment]),
      });
      expect(rendered).toContain(`src="${protectedUrl}?preview=1"`);
    }
  );

  it('does not rewrite links or unrelated attachment paths', () => {
    const html = `<a href="${protectedUrl}">Download</a><img src="/attachments/image"><img src="${protectedUrl}-other">`;
    expect(replaceMailInlineAttachmentUrls(html, [attachment])).toBe(html);
  });
});
