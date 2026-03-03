import { createAdminClient } from '@tuturuuu/supabase/next/server';
import QRCode from 'qrcode';
import type { MiraToolContext } from '../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';

const DEFAULT_SIZE = 512;
const DEFAULT_FOREGROUND = '#000000';
const DEFAULT_BACKGROUND = '#FFFFFF';
const DRIVE_QR_PREFIX = 'drive/mira/qr';

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  if (!/^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(normalized)) {
    return fallback;
  }
  return normalized.toUpperCase();
}

function normalizeSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SIZE;
  }
  const rounded = Math.round(value);
  return Math.min(2048, Math.max(128, rounded));
}

function sanitizeFileName(value: unknown): string {
  if (typeof value !== 'string') {
    return `qr-${Date.now()}.png`;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return `qr-${Date.now()}.png`;
  }

  const withoutExt = trimmed.replace(/\.[A-Za-z0-9]+$/, '');
  const safeBase = withoutExt
    .replace(/[^A-Za-z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);

  const finalBase = safeBase || `qr-${Date.now()}`;
  return `${finalBase}.png`;
}

function toPngBytes(dataUrl: string): Uint8Array {
  if (!dataUrl.startsWith('data:')) {
    throw new Error("Malformed data URL: expected 'data:[mime];base64,<data>'");
  }

  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    throw new Error("Malformed data URL: expected 'data:[mime];base64,<data>'");
  }

  const metadata = dataUrl.slice(5, commaIndex);
  if (!/^[^,]*;base64$/i.test(metadata)) {
    throw new Error("Malformed data URL: expected 'data:[mime];base64,<data>'");
  }

  const mime = metadata.slice(0, -';base64'.length).toLowerCase();
  if (mime && mime !== 'image/png') {
    throw new Error("Malformed data URL: expected 'data:[mime];base64,<data>'");
  }

  const base64 = dataUrl.slice(commaIndex + 1).trim();
  if (!base64) {
    throw new Error("Malformed data URL: expected 'data:[mime];base64,<data>'");
  }

  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

export async function executeCreateQrCode(
  args: Record<string, unknown>,
  ctx: MiraToolContext
): Promise<unknown> {
  const rawValue = typeof args.value === 'string' ? args.value.trim() : '';
  if (!rawValue) {
    return {
      success: false,
      error: 'QR value is required.',
    };
  }

  const size = normalizeSize(args.size);
  const foregroundColor = normalizeHexColor(
    args.foregroundColor,
    DEFAULT_FOREGROUND
  );
  const backgroundColor = normalizeHexColor(
    args.backgroundColor,
    DEFAULT_BACKGROUND
  );
  const fileName = sanitizeFileName(args.fileName);

  const fileId = crypto.randomUUID();
  const wsId = getWorkspaceContextWorkspaceId(ctx);
  const storagePath = `${wsId}/${DRIVE_QR_PREFIX}/${fileId}-${fileName}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(rawValue, {
      type: 'image/png',
      width: size,
      margin: 2,
      color: {
        dark: foregroundColor,
        light: backgroundColor,
      },
      errorCorrectionLevel: 'M',
    });

    const sbAdmin = await createAdminClient();
    const pngBytes = toPngBytes(qrDataUrl);

    const { error: uploadError } = await sbAdmin.storage
      .from('workspaces')
      .upload(storagePath, pngBytes, {
        contentType: 'image/png',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData, error: signedUrlError } = await sbAdmin.storage
      .from('workspaces')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 30);

    if (signedUrlError || !urlData?.signedUrl) {
      throw new Error(
        `Signed URL failed: ${signedUrlError?.message ?? 'No signed URL returned'}`
      );
    }

    return {
      success: true,
      qrCodeUrl: urlData.signedUrl,
      downloadUrl: urlData.signedUrl,
      storagePath,
      drivePath: storagePath.replace(`${wsId}/`, ''),
      fileName,
      size,
      foregroundColor,
      backgroundColor,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to generate QR code.',
    };
  }
}
