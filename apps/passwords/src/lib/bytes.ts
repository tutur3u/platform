const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  return btoa(binary);
}

export function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Returns null for binary content so it is offered as a download only. */
export function decodeUtf8(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** A local download name from a label; the server never sees or stores it. */
export function downloadName(label: string) {
  const cleaned = Array.from(label, (char) =>
    char.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(char) ? '_' : char
  )
    .join('')
    .trim()
    .slice(0, 100);
  return cleaned || 'secret';
}
