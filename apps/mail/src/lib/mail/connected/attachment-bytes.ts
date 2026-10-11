export function attachmentBytes(
  content: ArrayBuffer | Uint8Array | string
): Uint8Array {
  return typeof content === 'string'
    ? new TextEncoder().encode(content)
    : content instanceof Uint8Array
      ? content
      : new Uint8Array(content);
}
