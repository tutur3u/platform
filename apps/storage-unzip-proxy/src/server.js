import unzipper from 'unzipper';
import {
  createFetchWithTimeout,
  createUnzipProxyHandler,
  createUploadDependencies,
} from './handler.js';
import { resolveUnzipProxyLimits } from './limits.js';
import {
  buildSignedUploadHeaders,
  validateSignedUploadDestination,
} from './upload-destination.js';

const PORT = Number(process.env.PORT || 8788);
const SHARED_TOKEN = process.env.DRIVE_UNZIP_PROXY_SHARED_TOKEN || '';
const ALLOWED_UPLOAD_ORIGINS =
  process.env.DRIVE_UNZIP_PROXY_ALLOWED_UPLOAD_ORIGINS || '';
const ALLOW_LOCAL_UPLOAD_ORIGINS =
  process.env.DRIVE_UNZIP_PROXY_ALLOW_LOCAL_UPLOAD_ORIGINS === 'true';
const limits = resolveUnzipProxyLimits();

if (!SHARED_TOKEN) {
  throw new Error(
    'DRIVE_UNZIP_PROXY_SHARED_TOKEN is required for the storage unzip proxy.'
  );
}

const fetchWithTimeout = createFetchWithTimeout(fetch, limits.fetchTimeoutMs);
const { postDirectory, uploadFile } = createUploadDependencies({
  allowedUploadOrigins: ALLOWED_UPLOAD_ORIGINS,
  allowLocalUploadOrigins: ALLOW_LOCAL_UPLOAD_ORIGINS,
  buildSignedUploadHeaders,
  fetchFn: fetchWithTimeout,
  validateSignedUploadDestination,
});
const handler = createUnzipProxyHandler({
  fetchFn: fetchWithTimeout,
  limits,
  parseArchive: (buffer) => unzipper.Open.buffer(buffer),
  postDirectory,
  sharedToken: SHARED_TOKEN,
  uploadFile,
});

Bun.serve({
  port: PORT,
  fetch: handler,
});
