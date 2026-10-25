import { downloadName } from './bytes';

/** Hands bytes to the browser as a file; the object URL is revoked immediately. */
export function saveBytes(bytes: Uint8Array, label: string) {
  const blob = new Blob([bytes.slice()], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = downloadName(label);
  anchor.click();
  URL.revokeObjectURL(url);
}
