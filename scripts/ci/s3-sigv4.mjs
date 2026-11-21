// AWS Signature Version 4 for single S3 object requests, as R2's
// S3-compatible API requires. It covers what the escrow needs: path-style
// object URLs, no query string, and a signed SHA-256 payload hash. Verified
// against AWS's published header-signing example in s3-sigv4.test.mjs.
import { createHash, createHmac } from 'node:crypto';

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding of each path segment; S3 keeps `/` as the separator. */
function canonicalPath(pathname) {
  return pathname
    .split('/')
    .map((segment) =>
      encodeURIComponent(decodeURIComponent(segment)).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
      )
    )
    .join('/');
}

/** `20130524T000000Z` form of a Date. */
export function amzDate(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * Returns the headers for a signed request: the caller's headers plus
 * `x-amz-date`, `x-amz-content-sha256` and `authorization`.
 */
export function signS3Request({
  method,
  url,
  headers = {},
  body = '',
  accessKeyId,
  secretAccessKey,
  region,
  service = 's3',
  date = new Date(),
}) {
  const target = new URL(url);
  if (target.search) throw new Error('query strings are not supported');
  const stamp = amzDate(date);
  const day = stamp.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const all = {
    ...Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [
        k.toLowerCase(),
        String(v).trim(),
      ])
    ),
    host: target.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': stamp,
  };
  const names = Object.keys(all).sort();
  const canonicalHeaders = names
    .map((name) => `${name}:${all[name]}\n`)
    .join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [
    method,
    canonicalPath(target.pathname),
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    stamp,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service),
    'aws4_request'
  );
  const signature = createHmac('sha256', signingKey)
    .update(stringToSign)
    .digest('hex');
  const { host: _host, ...outgoing } = all;
  return {
    ...outgoing,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
