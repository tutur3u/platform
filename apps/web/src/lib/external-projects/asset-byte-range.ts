type RangeResult = { body: Uint8Array; status: 200 | 206 } | { status: 416 };

/**
 * Applies a single `bytes=a-b` range to a complete body. A header that is not
 * a single satisfiable-syntax range yields the whole body, as the asset route
 * always has. Sets Content-Range on `headers` for 206 and 416 answers.
 */
export function sliceByteRange(
  body: Uint8Array,
  requestedRange: string | null,
  headers: Headers
): RangeResult {
  const range = /^bytes=(\d{0,16})-(\d{0,16})$/.exec(requestedRange ?? '');
  if (!range || !(range[1] || range[2])) return { body, status: 200 };
  const length = body.byteLength;
  const start = range[1]
    ? Number(range[1])
    : Math.max(0, length - Number(range[2]));
  const end =
    range[1] && range[2] ? Math.min(length - 1, Number(range[2])) : length - 1;
  if (start >= length || end < start) {
    headers.set('Content-Range', `bytes */${length}`);
    return { status: 416 };
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${length}`);
  return { body: body.subarray(start, end + 1), status: 206 };
}
