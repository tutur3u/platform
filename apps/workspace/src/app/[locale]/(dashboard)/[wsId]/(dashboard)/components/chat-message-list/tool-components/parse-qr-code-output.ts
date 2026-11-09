import { isValidHttpUrl } from '@tuturuuu/utils/format';

export type ParsedQrCodeOutput = {
  previewUrl: string;
  downloadUrl: string;
  fileName?: string;
};

export function parseQrCodeOutput(
  outputRecord: Record<string, unknown> | null
): ParsedQrCodeOutput | null {
  if (!outputRecord) return null;

  const qrCodeUrlRaw =
    typeof outputRecord.qrCodeUrl === 'string' ? outputRecord.qrCodeUrl : '';
  const downloadUrlRaw =
    typeof outputRecord.downloadUrl === 'string'
      ? outputRecord.downloadUrl
      : qrCodeUrlRaw;

  const qrCodeUrl = qrCodeUrlRaw.trim();
  const downloadUrl = downloadUrlRaw.trim();

  if (!isValidHttpUrl(qrCodeUrl) || !isValidHttpUrl(downloadUrl)) {
    return null;
  }

  const fileNameRaw =
    typeof outputRecord.fileName === 'string'
      ? outputRecord.fileName.trim()
      : '';

  return {
    previewUrl: qrCodeUrl,
    downloadUrl,
    ...(fileNameRaw ? { fileName: fileNameRaw } : {}),
  };
}
