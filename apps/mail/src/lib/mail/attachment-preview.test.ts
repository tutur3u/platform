import { describe, expect, it } from 'vitest';
import {
  mailAttachmentPreviewType,
  mailAttachmentPreviewUrl,
} from './attachment-preview';

describe('safe attachment previews', () => {
  it.each(['text/html', 'image/svg+xml', 'application/javascript'])(
    'keeps active or unsupported %s downloads out of the preview',
    (type) => {
      expect(mailAttachmentPreviewType(type, 'attachment.txt')).toBeNull();
    }
  );
  it.each([
    ['image/png', 'image'],
    ['video/mp4', 'video'],
    ['audio/mpeg', 'audio'],
    ['application/pdf', 'pdf'],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'docx',
    ],
    ['text/plain; charset=utf-8', 'text'],
  ])('previews %s', (type, kind) => {
    expect(mailAttachmentPreviewType(type!, 'attachment')).toMatchObject({
      kind,
    });
  });
  it('supports raw txt files without allowing other binary files', () => {
    expect(
      mailAttachmentPreviewType('application/octet-stream', 'README.TXT')?.kind
    ).toBe('text');
    expect(
      mailAttachmentPreviewType('application/octet-stream', 'file.html')
    ).toBeNull();
    expect(mailAttachmentPreviewUrl('/attachment?mailbox=1')).toBe(
      '/attachment?mailbox=1&preview=1'
    );
  });
});

it('recognizes DOCX filenames only with the binary fallback MIME', () => {
  expect(
    mailAttachmentPreviewType('application/octet-stream', 'Report.DOCX')?.kind
  ).toBe('docx');
  expect(mailAttachmentPreviewType('text/html', 'Report.docx')).toBeNull();
  expect(
    mailAttachmentPreviewType('application/octet-stream', 'Report.docm')
  ).toBeNull();
});
