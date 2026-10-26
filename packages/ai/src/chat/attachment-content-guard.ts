/**
 * Mira chat attachments are uploaded straight to storage through a signed URL,
 * so neither the declared size nor the extension can be trusted. Every reader
 * that issues a URL for, or sends bytes of, an uploaded object to the model
 * checks the stored size and the leading bytes against the extension first.
 */

// Every model request injects the chat's attachments within a 32 MiB budget,
// so a larger single file could upload yet never reach the model.
export const MAX_AI_CHAT_UPLOAD_BYTES = 32 * 1024 * 1024;

/** Leading bytes a reader must fetch to classify any supported extension. */
export const AI_CHAT_ATTACHMENT_SIGNATURE_BYTES = 64;

const TEXT_EXTENSIONS = new Set(['csv', 'json', 'md', 'txt']);

/** Extensions the upload-url route accepts, and therefore must verify. */
export const AI_CHAT_ATTACHMENT_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  'aac',
  'doc',
  'docx',
  'flac',
  'gif',
  'heic',
  'heif',
  'jpeg',
  'jpg',
  'm4a',
  'mov',
  'mp3',
  'mp4',
  'ogg',
  'opus',
  'pdf',
  'png',
  'ppt',
  'pptx',
  'wav',
  'webm',
  'webp',
  'xls',
  'xlsx',
]);

const ISO_BMFF_IMAGE_BRANDS = new Set([
  'avif',
  'heic',
  'heim',
  'heis',
  'heix',
  'hevc',
  'hevx',
  'mif1',
  'msf1',
]);

const QUICKTIME_ATOMS = new Set([
  'free',
  'mdat',
  'moov',
  'pnot',
  'skip',
  'wide',
]);

const OLE_COMPOUND = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04];

function startsWith(head: Uint8Array, bytes: number[], offset = 0) {
  if (head.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => head[offset + index] === byte);
}

function ascii(head: Uint8Array, start: number, end: number) {
  if (head.length < end) return '';
  return String.fromCharCode(...head.subarray(start, end));
}

function isIsoBmff(head: Uint8Array) {
  return ascii(head, 4, 8) === 'ftyp';
}

function isMp3(head: Uint8Array) {
  if (ascii(head, 0, 3) === 'ID3') return true;
  return head.length >= 2 && head[0] === 0xff && (head[1]! & 0xe0) === 0xe0;
}

function isAdtsAac(head: Uint8Array) {
  if (ascii(head, 0, 3) === 'ID3') return true;
  return head.length >= 2 && head[0] === 0xff && (head[1]! & 0xf6) === 0xf0;
}

export function aiChatAttachmentTextEncoding(head: Uint8Array) {
  if (startsWith(head, [0xff, 0xfe])) return 'utf-16le';
  if (startsWith(head, [0xfe, 0xff])) return 'utf-16be';
  return 'utf-8';
}

export function aiChatAttachmentExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex === -1 ? '' : fileName.slice(dotIndex + 1).toLowerCase();
}

/**
 * Returns whether `head` (the object's first bytes) is plausibly the format
 * its extension claims. Unknown extensions never match.
 */
export function matchesAiChatAttachmentSignature(
  fileName: string,
  head: Uint8Array
): boolean {
  const extension = aiChatAttachmentExtension(fileName);

  if (TEXT_EXTENSIONS.has(extension)) {
    const encoding = aiChatAttachmentTextEncoding(head);
    if (encoding === 'utf-8') return !head.includes(0);
    try {
      // The bounded prefix may end halfway through a UTF-16 character.
      const decoded = new TextDecoder(encoding, { fatal: true }).decode(head, {
        stream: true,
      });
      return !decoded.includes('\0');
    } catch {
      return false;
    }
  }

  switch (extension) {
    case 'png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'jpg':
    case 'jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'gif':
      return ['GIF87a', 'GIF89a'].includes(ascii(head, 0, 6));
    case 'webp':
      return ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP';
    case 'heic':
    case 'heif':
      return isIsoBmff(head) && ISO_BMFF_IMAGE_BRANDS.has(ascii(head, 8, 12));
    case 'pdf':
      return ascii(head, 0, 5) === '%PDF-';
    case 'mp4':
    case 'm4a':
      return isIsoBmff(head);
    case 'mov':
      return isIsoBmff(head) || QUICKTIME_ATOMS.has(ascii(head, 4, 8));
    case 'webm':
      return startsWith(head, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'mp3':
      return isMp3(head);
    case 'aac':
      return isAdtsAac(head);
    case 'wav':
      return ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WAVE';
    case 'ogg':
    case 'opus':
      return ascii(head, 0, 4) === 'OggS';
    case 'flac':
      return ascii(head, 0, 4) === 'fLaC';
    case 'docx':
    case 'pptx':
    case 'xlsx':
      return startsWith(head, ZIP_LOCAL_HEADER);
    case 'doc':
    case 'ppt':
    case 'xls':
      return startsWith(head, OLE_COMPOUND);
    default:
      return false;
  }
}

export type AiChatAttachmentVerdict =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'too_large' | 'content_mismatch' };

/** Checks a stored object's real size and leading bytes. */
export function inspectAiChatAttachment({
  fileName,
  head,
  sizeBytes,
}: {
  fileName: string;
  head: Uint8Array;
  sizeBytes: number;
}): AiChatAttachmentVerdict {
  if (sizeBytes > MAX_AI_CHAT_UPLOAD_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  const extension = aiChatAttachmentExtension(fileName);
  if (sizeBytes === 0) {
    return TEXT_EXTENSIONS.has(extension)
      ? { ok: true }
      : { ok: false, reason: 'empty' };
  }
  return matchesAiChatAttachmentSignature(fileName, head)
    ? { ok: true }
    : { ok: false, reason: 'content_mismatch' };
}
