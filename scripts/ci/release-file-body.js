const { createHash } = require('node:crypto');
const MAX_RELEASE_FILE_BYTES = 16 * 1024 * 1024;
const SHA = /^[a-f0-9]{40}$/;

function validateReleaseFileMetadata(metadata, path) {
  if (
    metadata?.type !== 'file' ||
    metadata.path !== path ||
    !SHA.test(metadata.sha || '') ||
    !Number.isSafeInteger(metadata.size) ||
    metadata.size < 0 ||
    metadata.size > MAX_RELEASE_FILE_BYTES
  )
    throw new Error('Invalid immutable release file metadata');
}

function decodeReleaseFileBody(body, metadata) {
  if (
    body?.encoding !== 'base64' ||
    typeof body.content !== 'string' ||
    body.sha !== metadata.sha ||
    body.size !== metadata.size ||
    body.truncated === true ||
    body.content.length > MAX_RELEASE_FILE_BYTES * 2
  )
    throw new Error('Cannot read complete release file');
  const encoded = body.content.replace(/[\r\n]/g, '');
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded
    )
  )
    throw new Error('Invalid release file base64');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== metadata.size || bytes.toString('base64') !== encoded)
    throw new Error('Incomplete release file body');
  const digest = createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
  if (digest !== metadata.sha)
    throw new Error('Release blob identity mismatch');
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    bytes
  );
}
module.exports = {
  MAX_RELEASE_FILE_BYTES,
  validateReleaseFileMetadata,
  decodeReleaseFileBody,
};
