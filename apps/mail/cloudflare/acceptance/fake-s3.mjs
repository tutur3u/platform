import { createHash } from 'node:crypto';

/**
 * In-process S3 stand-in for Mail's R2 client. The Worker's outbound fetch to
 * the endpoint host is answered here, so no socket and no container is used.
 * It serves exactly what Mail issues: PutObject, GetObject (with Range) and
 * DeleteObject, in path style or virtual-host style.
 */
export function createFakeS3({ endpointHost }) {
  const objects = new Map();
  const counts = { put: 0, get: 0, delete: 0, missing: 0 };

  const matches = (url) =>
    url.hostname === endpointHost || url.hostname.endsWith(`.${endpointHost}`);

  function locate(url) {
    const path = decodeURIComponent(url.pathname).replace(/^\//u, '');
    if (url.hostname !== endpointHost)
      return {
        bucket: url.hostname.slice(0, -endpointHost.length - 1),
        key: path,
      };
    const slash = path.indexOf('/');
    return slash < 0
      ? { bucket: path, key: '' }
      : { bucket: path.slice(0, slash), key: path.slice(slash + 1) };
  }

  /** Strips `aws-chunked` framing, which the SDK uses for checksum trailers. */
  function decodeAwsChunked(bytes) {
    const parts = [];
    let offset = 0;
    while (offset < bytes.length) {
      const lineEnd = bytes.indexOf('\r\n', offset);
      if (lineEnd < 0) break;
      const size = Number.parseInt(
        Buffer.from(bytes.subarray(offset, lineEnd))
          .toString('latin1')
          .split(';')[0],
        16
      );
      if (!Number.isFinite(size) || size === 0) break;
      const start = lineEnd + 2;
      parts.push(bytes.subarray(start, start + size));
      offset = start + size + 2;
    }
    return Buffer.concat(parts);
  }

  const xmlError = (status, code) =>
    new Response(`<?xml version="1.0"?><Error><Code>${code}</Code></Error>`, {
      status,
      headers: { 'content-type': 'application/xml' },
    });

  async function handle(request) {
    const url = new URL(request.url);
    const { bucket, key } = locate(url);
    const id = `${bucket}/${key}`;
    if (request.method === 'PUT') {
      counts.put += 1;
      const raw = Buffer.from(await request.arrayBuffer());
      const chunked =
        (request.headers.get('content-encoding') ?? '').includes(
          'aws-chunked'
        ) ||
        (request.headers.get('x-amz-content-sha256') ?? '').startsWith(
          'STREAMING-'
        );
      const bytes = chunked ? decodeAwsChunked(raw) : raw;
      const etag = `"${createHash('md5').update(bytes).digest('hex')}"`;
      objects.set(id, {
        bytes,
        etag,
        contentType:
          request.headers.get('content-type') ?? 'application/octet-stream',
      });
      return new Response(null, { status: 200, headers: { etag } });
    }
    if (request.method === 'DELETE') {
      counts.delete += 1;
      objects.delete(id);
      return new Response(null, { status: 204 });
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      const object = objects.get(id);
      if (!object) {
        counts.missing += 1;
        return xmlError(404, 'NoSuchKey');
      }
      counts.get += 1;
      const range = /^bytes=(\d*)-(\d*)$/u.exec(
        request.headers.get('range') ?? ''
      );
      const headers = {
        'accept-ranges': 'bytes',
        'content-type': object.contentType,
        etag: object.etag,
      };
      if (range) {
        const total = object.bytes.length;
        const start =
          range[1] === '' ? total - Number(range[2]) : Number(range[1]);
        const end =
          range[1] === '' || range[2] === ''
            ? total - 1
            : Math.min(Number(range[2]), total - 1);
        const slice = object.bytes.subarray(start, end + 1);
        return new Response(request.method === 'HEAD' ? null : slice, {
          status: 206,
          headers: {
            ...headers,
            'content-length': String(slice.length),
            'content-range': `bytes ${start}-${end}/${total}`,
          },
        });
      }
      return new Response(request.method === 'HEAD' ? null : object.bytes, {
        status: 200,
        headers: { ...headers, 'content-length': String(object.bytes.length) },
      });
    }
    return xmlError(405, 'MethodNotAllowed');
  }

  return {
    handle,
    matches,
    /** Seeds an object the way the Email Routing Worker does before ingest. */
    put(bucket, key, bytes, contentType) {
      const body = Buffer.from(bytes);
      objects.set(`${bucket}/${key}`, {
        bytes: body,
        etag: `"${createHash('md5').update(body).digest('hex')}"`,
        contentType,
      });
    },
    has: (bucket, key) => objects.has(`${bucket}/${key}`),
    stats: () => ({ ...counts, objects: objects.size }),
  };
}
