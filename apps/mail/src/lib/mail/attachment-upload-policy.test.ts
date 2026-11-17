import { guardApiProxyBody } from '@tuturuuu/utils/api-proxy-body';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  MAIL_ATTACHMENT_FILE_BYTES,
  MAIL_ATTACHMENT_MULTIPART_BYTES,
  MAIL_ATTACHMENT_REQUEST_BYTES,
  mailAttachmentUploadPayloadPolicy,
} from './attachment-upload-policy';

const pathname =
  '/api/v1/workspaces/personal/mail/mailboxes/box-1/drafts/draft-1/attachments';
const origin = 'https://mail.tuturuuu.com';

function multipartRequest(path = pathname, size = 3 * 1024 * 1024) {
  const body = new FormData();
  body.append(
    'file',
    new Blob(['%PDF-1.7\n', new Uint8Array(size)], {
      type: 'application/pdf',
    }),
    'document.pdf'
  );
  return new NextRequest(`${origin}${path}`, { method: 'POST', body });
}

function guarded(request: NextRequest) {
  return guardApiProxyBody(
    request,
    mailAttachmentUploadPayloadPolicy(request).maxPayloadBytes
  );
}

describe('Mail draft attachment payload scope', () => {
  it('keeps a 10 MiB file budget with bounded multipart headroom', () => {
    expect(MAIL_ATTACHMENT_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAIL_ATTACHMENT_MULTIPART_BYTES).toBe(64 * 1024);
    expect(MAIL_ATTACHMENT_REQUEST_BYTES).toBe(10_551_296);
    expect(
      mailAttachmentUploadPayloadPolicy(
        new NextRequest(`${origin}${pathname}`, { method: 'POST' })
      )
    ).toEqual({ maxPayloadBytes: MAIL_ATTACHMENT_REQUEST_BYTES });
  });

  it('ignores query parameters without widening the path', () => {
    expect(
      mailAttachmentUploadPayloadPolicy(
        new NextRequest(`${origin}${pathname}?next=/different`, {
          method: 'POST',
        })
      )
    ).toEqual({ maxPayloadBytes: MAIL_ATTACHMENT_REQUEST_BYTES });
  });

  it('matches a mounted request only after NextRequest strips its basePath', () => {
    const mounted = new NextRequest(`https://tuturuuu.com/mail${pathname}`, {
      method: 'POST',
      nextConfig: { basePath: '/mail' },
    });
    expect(mounted.nextUrl.basePath).toBe('/mail');
    expect(mounted.nextUrl.pathname).toBe(pathname);
    expect(mailAttachmentUploadPayloadPolicy(mounted)).toEqual({
      maxPayloadBytes: MAIL_ATTACHMENT_REQUEST_BYTES,
    });
    expect(
      mailAttachmentUploadPayloadPolicy(
        new NextRequest(`${origin}/mail${pathname}`, { method: 'POST' })
      )
    ).toEqual({});
  });

  it.each(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'does not uplift %s requests',
    (method) => {
      expect(
        mailAttachmentUploadPayloadPolicy(
          new NextRequest(`${origin}${pathname}`, { method })
        )
      ).toEqual({});
    }
  );

  it.each([
    `${pathname}/`,
    `${pathname}/attachment-1`,
    `${pathname}/upload`,
    `${pathname}-copy`,
    pathname.replace('/drafts/', '/messages/'),
    pathname.replace('/draft-1/', '//'),
    pathname.replace('/box-1/', '/box%2Fother/'),
    pathname.replace('/personal/', '/personal%20/'),
    pathname.replace('/mail/', '/mail//'),
    pathname.replace('/mail/', '/MAIL/'),
    pathname.replace('/attachments', ''),
    '/api/v1/workspaces/personal/people',
    '/api/v1/webhooks/mail/cloudflare',
    '/en' + pathname,
  ])('retains the default cap for near-match %s', (path) => {
    expect(
      mailAttachmentUploadPayloadPolicy(
        new NextRequest(`${origin}${path}`, { method: 'POST' })
      )
    ).toEqual({});
  });
});

describe('Mail upload body guard', () => {
  it('admits a 3 MiB multipart PDF without consuming the route body', async () => {
    const request = multipartRequest();
    await expect(guarded(request)).resolves.toBeNull();
    const file = (await request.formData()).get('file');
    expect(file).toBeInstanceOf(File);
    if (!(file instanceof File)) throw new Error('Expected uploaded file');
    expect(file.name).toBe('document.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBeGreaterThan(3 * 1024 * 1024);
  });

  it('rejects that PDF on an unrelated route at the unchanged default cap', async () => {
    const rejected = await guarded(
      multipartRequest('/api/v1/workspaces/personal/people')
    );
    expect(rejected?.status).toBe(413);
    await expect(rejected?.json()).resolves.toEqual({
      error: 'Payload Too Large',
      message: 'Request body exceeds limit',
    });
  });

  it('admits a maximum-sized file plus ordinary multipart metadata', async () => {
    const body = new FormData();
    body.append(
      'file',
      new Blob([new Uint8Array(MAIL_ATTACHMENT_FILE_BYTES)]),
      'maximum.pdf'
    );
    body.append('contentId', 'image@example.test');
    body.append('disposition', 'inline');
    await expect(
      guarded(new NextRequest(`${origin}${pathname}`, { method: 'POST', body }))
    ).resolves.toBeNull();
  });

  it('rejects an oversized file that exceeds the complete envelope', async () => {
    const rejected = await guarded(
      multipartRequest(pathname, MAIL_ATTACHMENT_REQUEST_BYTES + 1)
    );
    expect(rejected?.status).toBe(413);
  });

  it('accepts exactly the request-byte boundary and rejects one byte beyond it', async () => {
    const request = (size: number) =>
      new NextRequest(`${origin}${pathname}`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array(size),
      });
    await expect(
      guarded(request(MAIL_ATTACHMENT_REQUEST_BYTES))
    ).resolves.toBeNull();
    expect(
      (await guarded(request(MAIL_ATTACHMENT_REQUEST_BYTES + 1)))?.status
    ).toBe(413);
  });

  it('rejects a declared oversized envelope before reading its body', async () => {
    const request = new NextRequest(`${origin}${pathname}`, {
      method: 'POST',
      headers: { 'content-length': String(MAIL_ATTACHMENT_REQUEST_BYTES + 1) },
      body: 'small',
    });
    expect((await guarded(request))?.status).toBe(413);
  });
});
