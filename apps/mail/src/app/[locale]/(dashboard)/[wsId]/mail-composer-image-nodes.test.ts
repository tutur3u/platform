import { describe, expect, it } from 'vitest';
import {
  mailImageAttachmentId,
  mailImageNodeId,
  stripPendingMailImages,
} from './mail-composer-image-nodes';

const raw = '/api/v1/workspaces/w/mail/mailboxes/m/drafts/d/attachments/att-1';

describe('stripPendingMailImages', () => {
  it.each([
    ['queued', '<img src="blob:x" data-mail-upload="queued">'],
    ['uploading', '<img data-mail-upload="uploading" src="blob:x">'],
    ['failed', '<img src="blob:x" data-mail-upload="failed" width="50%">'],
    ['removing', `<img src="${raw}" data-mail-upload="removing">`],
    ['bare blob', '<img src="blob:https://mail.example/abc">'],
    ['bare data', "<img src='data:image/png;base64,AAAA'>"],
  ])('removes a %s placeholder', (_name, tag) => {
    expect(stripPendingMailImages(`<p>a</p>${tag}<p>b</p>`)).toBe(
      '<p>a</p><p>b</p>'
    );
  });

  it('keeps settled and external images untouched', () => {
    const html = `<p>x</p><img src="${raw}" width="50%"><img src="https://img.example/a.png" alt="a > b">`;
    expect(stripPendingMailImages(html)).toBe(html);
  });

  it('is not fooled by a ">" inside a quoted attribute', () => {
    const html = '<img alt="a > b" src="blob:x" data-mail-upload="queued">tail';
    expect(stripPendingMailImages(html)).toBe('tail');
  });

  it('removes only the placeholders among several images', () => {
    const html = `<img src="${raw}"><img src="blob:x" data-mail-upload="uploading"><img src="${raw}2">`;
    expect(stripPendingMailImages(html)).toBe(
      `<img src="${raw}"><img src="${raw}2">`
    );
  });

  it('returns image-free html unchanged', () => {
    expect(stripPendingMailImages('<p>plain</p>')).toBe('<p>plain</p>');
  });
});

describe('image ids', () => {
  it('reads the attachment id from a raw draft source', () => {
    expect(mailImageAttachmentId(raw)).toBe('att-1');
    expect(mailImageAttachmentId(`${raw}?x=1`)).toBe('att-1');
    expect(mailImageAttachmentId('https://img.example/a.png')).toBeNull();
  });

  it('identifies a node by its instance id, never by its attachment', () => {
    expect(mailImageNodeId({ src: raw, uploadId: 'u1' })).toBe('u1');
    expect(mailImageNodeId({ src: raw })).toBeNull();
    expect(mailImageNodeId({ src: 'blob:x' })).toBeNull();
  });
});
