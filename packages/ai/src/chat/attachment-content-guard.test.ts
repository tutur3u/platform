import { describe, expect, it } from 'vitest';
import {
  inspectAiChatAttachment,
  MAX_AI_CHAT_UPLOAD_BYTES,
  matchesAiChatAttachmentSignature,
} from './attachment-content-guard';

const text = (value: string) => new TextEncoder().encode(value);
const ftyp = (brand: string) =>
  new Uint8Array([0, 0, 0, 0x18, ...text('ftyp'), ...text(brand)]);

describe('matchesAiChatAttachmentSignature', () => {
  it.each([
    ['a.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['a.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe1])],
    ['a.gif', text('GIF89a')],
    ['a.webp', text('RIFF\0\0\0\0WEBP')],
    ['a.heic', ftyp('heic')],
    ['a.pdf', text('%PDF-1.7')],
    ['a.m4a', ftyp('M4A ')],
    ['a.mp4', ftyp('isom')],
    ['a.mov', ftyp('qt  ')],
    ['a.wav', text('RIFF\0\0\0\0WAVE')],
    ['a.mp3', text('ID3')],
    ['a.ogg', text('OggS')],
    ['a.flac', text('fLaC')],
    ['a.docx', new Uint8Array([0x50, 0x4b, 0x03, 0x04])],
    ['a.xls', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ['a.md', text('# Notes')],
    ['a.txt', new Uint8Array([0xff, 0xfe, 0x41, 0, 0x42, 0])],
    ['a.csv', new Uint8Array([0xfe, 0xff, 0, 0x41, 0, 0x2c, 0, 0x42])],
    ['a.txt', new Uint8Array([0xff, 0xfe, 0x3d, 0xd8, 0, 0xde])],
    ['a.txt', new Uint8Array([0xff, 0xfe, 0x41, 0, 0x3d, 0xd8])],
  ])('accepts a real %s', (name, head) => {
    expect(matchesAiChatAttachmentSignature(name, head)).toBe(true);
  });

  it.each([
    ['photo.jpg', text('<html><script>')],
    ['photo.png', new Uint8Array([0xff, 0xd8, 0xff])],
    ['scan.pdf', text('MZ\x90\0')],
    ['notes.txt', new Uint8Array([0x4d, 0x5a, 0, 0])],
    ['tool.exe', text('MZ')],
    ['a.txt', new Uint8Array([0xff, 0xfe, 0, 0])],
    ['a.csv', new Uint8Array([0xfe, 0xff, 0, 0])],
    ['a.txt', new Uint8Array([0xff, 0xfe, 0, 0xdc])],
  ])('rejects a mislabelled %s', (name, head) => {
    expect(matchesAiChatAttachmentSignature(name, head)).toBe(false);
  });
});

describe('inspectAiChatAttachment', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

  it('rejects stored objects over the limit', () => {
    expect(
      inspectAiChatAttachment({
        fileName: 'a.jpg',
        head: jpeg,
        sizeBytes: MAX_AI_CHAT_UPLOAD_BYTES + 1,
      })
    ).toEqual({ ok: false, reason: 'too_large' });
  });

  it('allows empty text but not empty binaries', () => {
    const empty = new Uint8Array();
    expect(
      inspectAiChatAttachment({ fileName: 'a.txt', head: empty, sizeBytes: 0 })
    ).toEqual({ ok: true });
    expect(
      inspectAiChatAttachment({ fileName: 'a.jpg', head: empty, sizeBytes: 0 })
    ).toEqual({ ok: false, reason: 'empty' });
  });
});
