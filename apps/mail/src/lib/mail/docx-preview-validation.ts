const MAX_DOCX_BYTES = 10 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;

/** Validate ZIP structure and actual expansion before the document renderer runs. */
export async function validateMailDocx(
  bytes: ArrayBuffer,
  signal?: AbortSignal
) {
  const view = new DataView(bytes);
  const fail = () => {
    throw new Error('Invalid or oversized DOCX attachment');
  };
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_DOCX_BYTES) fail();
  let end = bytes.byteLength - 22;
  const earliest = Math.max(0, end - 65535);
  for (; end >= earliest; end--) {
    if (
      view.getUint32(end, true) === 0x06054b50 &&
      end + 22 + view.getUint16(end + 20, true) === bytes.byteLength
    )
      break;
  }
  if (end < earliest) fail();
  const count = view.getUint16(end + 10, true);
  if (
    !count ||
    count > 1000 ||
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    count !== view.getUint16(end + 8, true)
  )
    fail();
  let cursor = view.getUint32(end + 16, true);
  const directoryEnd = cursor + view.getUint32(end + 12, true);
  if (directoryEnd !== end) fail();
  const names = new Set<string>();
  let expanded = 0;
  for (let i = 0; i < count; i++) {
    signal?.throwIfAborted();
    if (
      cursor + 46 > directoryEnd ||
      view.getUint32(cursor, true) !== 0x02014b50
    )
      fail();
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const next =
      cursor +
      46 +
      nameLength +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true);
    const local = view.getUint32(cursor + 42, true);
    if (
      next > directoryEnd ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      size > MAX_EXPANDED_BYTES - expanded ||
      local + 30 > cursor
    )
      fail();
    if (
      view.getUint32(local, true) !== 0x04034b50 ||
      view.getUint16(local + 8, true) !== method
    )
      fail();
    const name = new TextDecoder().decode(
      new Uint8Array(bytes, cursor + 46, nameLength)
    );
    if (
      names.has(name) ||
      name.includes('..') ||
      name.startsWith('/') ||
      name.includes('\\')
    )
      fail();
    names.add(name);
    const start =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    if (start + compressed > view.getUint32(end + 16, true)) fail();
    if (method === 0) {
      if (size !== compressed) fail();
    } else {
      const stream = new Blob([bytes.slice(start, start + compressed)])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'));
      const reader = stream.getReader();
      let actual = 0;
      try {
        while (true) {
          signal?.throwIfAborted();
          const { value, done } = await reader.read();
          if (done) break;
          actual += value.byteLength;
          if (actual > size) fail();
        }
        if (actual !== size) fail();
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
    }
    expanded += size;
    cursor = next;
  }
  if (
    cursor !== directoryEnd ||
    !names.has('[Content_Types].xml') ||
    !names.has('word/document.xml')
  )
    fail();
}
