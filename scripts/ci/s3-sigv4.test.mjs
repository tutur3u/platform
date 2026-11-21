import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signS3Request } from './s3-sigv4.mjs';

// AWS S3 documentation, "Signature Calculations for the Authorization Header":
// GET Object example with a Range header (published example credentials).
test('matches the AWS SigV4 GET Object example', () => {
  const headers = signS3Request({
    method: 'GET',
    url: 'https://examplebucket.s3.amazonaws.com/test.txt',
    headers: { Range: 'bytes=0-9' },
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    date: new Date('2013-05-24T00:00:00Z'),
  });
  assert.equal(
    headers.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'
  );
  assert.equal(headers['x-amz-date'], '20130524T000000Z');
  assert.equal(headers.host, undefined);
});

test('signs the payload hash and rejects query strings', () => {
  const base = {
    method: 'PUT',
    url: 'https://acct.r2.cloudflarestorage.com/bucket/people-registry/production/0a1b2c3d.age',
    accessKeyId: 'id',
    secretAccessKey: 'secret',
    region: 'auto',
    date: new Date('2026-11-21T00:00:00Z'),
  };
  const a = signS3Request({ ...base, body: 'one' });
  const b = signS3Request({ ...base, body: 'two' });
  assert.notEqual(a.authorization, b.authorization);
  assert.notEqual(a['x-amz-content-sha256'], b['x-amz-content-sha256']);
  assert.throws(
    () => signS3Request({ ...base, url: `${base.url}?x=1` }),
    /query/
  );
});

// AWS S3 documentation, PUT Object example: non-empty body, a URI-encoded
// '$' in the key and an extra signed header.
test('matches the AWS SigV4 PUT Object example', () => {
  const headers = signS3Request({
    method: 'PUT',
    url: 'https://examplebucket.s3.amazonaws.com/test$file.text',
    headers: {
      Date: 'Fri, 24 May 2013 00:00:00 GMT',
      'x-amz-storage-class': 'REDUCED_REDUNDANCY',
    },
    body: 'Welcome to Amazon S3.',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    date: new Date('2013-05-24T00:00:00Z'),
  });
  assert.equal(
    headers['x-amz-content-sha256'],
    '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072'
  );
  assert.match(
    headers.authorization,
    /SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class, Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd$/
  );
});

test('signs the escrow request shape: PUT, content-type, path-style multi-segment key, region auto', () => {
  const base = {
    method: 'PUT',
    url: 'https://acct.r2.cloudflarestorage.com/tuturuuu-secret-escrow/people-registry/production/0a1b2c3d.age',
    headers: { 'content-type': 'application/octet-stream' },
    body: 'ciphertext',
    accessKeyId: 'id',
    secretAccessKey: 'secret',
    region: 'auto',
    date: new Date('2026-11-21T00:00:00Z'),
  };
  const signed = signS3Request(base);
  // Regression lock for this fixed vector; the algorithm itself is pinned by
  // the AWS GET and PUT examples above.
  assert.equal(
    signed['x-amz-content-sha256'],
    '305531dcc50ebca31cf1d5b31e9fc76ed51f66b3b6dd5a030c6539ae6532f979'
  );
  assert.ok(
    signed.authorization.endsWith(
      'Signature=11c3acdd39f64463d0f7249ce4d7b54b0bf1f0378ee152cdcab05f8ae7c64df7'
    )
  );
  assert.match(
    signed.authorization,
    /Credential=id\/20261121\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date,/
  );
  for (const change of [
    { method: 'GET' },
    { headers: { 'content-type': 'text/plain' } },
    { url: base.url.replace('production', 'staging') },
    { region: 'us-east-1' },
  ]) {
    assert.notEqual(
      signS3Request({ ...base, ...change }).authorization,
      signed.authorization
    );
  }
});
