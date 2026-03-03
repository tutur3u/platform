import { describe, expect, it } from 'vitest';
import { parseQrCodeOutput } from '../parse-qr-code-output';

describe('parseQrCodeOutput', () => {
  it('returns null when output record is null', () => {
    expect(parseQrCodeOutput(null)).toBeNull();
  });

  it('returns null when qrCodeUrl is missing or unsafe', () => {
    expect(parseQrCodeOutput({})).toBeNull();
    expect(parseQrCodeOutput({ qrCodeUrl: 'javascript:alert(1)' })).toBeNull();
  });

  it('returns null when downloadUrl is unsafe', () => {
    expect(
      parseQrCodeOutput({
        qrCodeUrl: 'https://example.com/qr.png',
        downloadUrl: 'data:text/plain,hello',
      })
    ).toBeNull();
  });

  it('parses valid qr output with explicit download URL', () => {
    expect(
      parseQrCodeOutput({
        qrCodeUrl: 'https://example.com/qr.png',
        downloadUrl: 'https://example.com/download.png',
        fileName: 'my-qr.png',
      })
    ).toEqual({
      previewUrl: 'https://example.com/qr.png',
      downloadUrl: 'https://example.com/download.png',
      fileName: 'my-qr.png',
    });
  });

  it('falls back downloadUrl to qrCodeUrl when missing', () => {
    expect(
      parseQrCodeOutput({
        qrCodeUrl: 'https://example.com/qr.png',
      })
    ).toEqual({
      previewUrl: 'https://example.com/qr.png',
      downloadUrl: 'https://example.com/qr.png',
    });
  });
});
