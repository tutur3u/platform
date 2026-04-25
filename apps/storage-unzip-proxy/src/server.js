import path from 'node:path';
import unzipper from 'unzipper';

const PORT = Number(process.env.PORT || 8788);
const SHARED_TOKEN = process.env.DRIVE_UNZIP_PROXY_SHARED_TOKEN || '';
const FETCH_TIMEOUT_MS = Number(
  process.env.DRIVE_UNZIP_PROXY_FETCH_TIMEOUT_MS || 30000
);
const MAX_ARCHIVE_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 2000;
const MAX_EXTRACTED_ENTRY_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_EXTRACTED_BYTES = 250 * 1024 * 1024;

const MIME_TYPES = {
  '.br': 'application/octet-stream',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.data': 'application/octet-stream',
  '.gif': 'image/gif',
  '.gz': 'application/gzip',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
};

if (!SHARED_TOKEN) {
  throw new Error(
    'DRIVE_UNZIP_PROXY_SHARED_TOKEN is required for the storage unzip proxy.'
  );
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

function getBearerToken(request) {
  const header = request.headers.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return header.slice(7).trim();
}

function normalizePathSegment(value) {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function normalizeZipEntryPath(value) {
  const normalized = normalizePathSegment(value);
  if (!normalized) {
    return null;
  }

  const segments = normalized.split('/').filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      return null;
    }
  }

  return segments.join('/');
}

function parseHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function joinArchivePath(prefix, value) {
  const normalizedValue = normalizeZipEntryPath(value);
  if (!normalizedValue) {
    return null;
  }

  const normalizedPrefix = prefix ? normalizeZipEntryPath(prefix) : '';
  if (prefix && !normalizedPrefix) {
    return null;
  }

  return normalizedPrefix
    ? `${normalizedPrefix}/${normalizedValue}`
    : normalizedValue;
}

function contentTypeForFile(filePath) {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith('.symbols.json')) {
    return 'application/json';
  }

  if (lowerPath.endsWith('.js.br') || lowerPath.endsWith('.js.gz')) {
    return 'application/javascript';
  }

  if (lowerPath.endsWith('.wasm.br') || lowerPath.endsWith('.wasm.gz')) {
    return 'application/wasm';
  }

  if (lowerPath.endsWith('.data.br') || lowerPath.endsWith('.data.gz')) {
    return 'application/octet-stream';
  }

  const extension = path.extname(filePath).toLowerCase();
  return MIME_TYPES[extension] || 'application/octet-stream';
}

async function drainResponseBody(response) {
  try {
    await response.arrayBuffer();
  } catch {
    await response.body?.cancel?.().catch(() => {});
  }
}

async function fetchWithTimeout(input, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(504, 'Upstream request timed out.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function postExtractedEntry({
  body,
  callbackToken,
  callbackUrl,
  filePath,
  operation,
  contentType,
}) {
  const response = await fetchWithTimeout(callbackUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${callbackToken}`,
      'Content-Type': contentType || 'application/octet-stream',
      'x-drive-auto-extract-operation': operation,
      'x-drive-auto-extract-path': filePath,
    },
    body,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new HttpError(
      response.status >= 400 && response.status < 500 ? response.status : 502,
      message || `Callback upload failed with status ${response.status}`
    );
  }
}

async function requestExtractedFileUpload({
  callbackToken,
  callbackUrl,
  contentType,
  filePath,
  size,
}) {
  const response = await fetchWithTimeout(callbackUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${callbackToken}`,
      'Content-Type': 'application/json',
      'x-drive-auto-extract-operation': 'file-upload-url',
      'x-drive-auto-extract-path': filePath,
    },
    body: JSON.stringify({
      contentType,
      size,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new HttpError(
      response.status >= 400 && response.status < 500 ? response.status : 502,
      message || `Upload URL callback failed with status ${response.status}`
    );
  }

  return response.json();
}

async function uploadExtractedFile({ body, contentType, uploadPayload }) {
  const headers = {
    ...(uploadPayload.headers || {}),
  };

  if (!headers['Content-Type']) {
    headers['Content-Type'] = contentType || 'application/octet-stream';
  }

  if (uploadPayload.token) {
    headers.Authorization = `Bearer ${uploadPayload.token}`;
  }

  let response = await fetchWithTimeout(uploadPayload.signedUrl, {
    method: 'PUT',
    headers,
    body,
  });

  if (!response.ok) {
    await drainResponseBody(response);
    // Retry without Content-Type because some signed-upload backends
    // require the retry request to omit headers that were not part of signing.
    const fallbackHeaders = { ...headers };
    delete fallbackHeaders['Content-Type'];

    response = await fetchWithTimeout(uploadPayload.signedUrl, {
      method: 'PUT',
      headers: fallbackHeaders,
      body,
    });
  }

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new HttpError(
      response.status >= 400 && response.status < 500 ? response.status : 502,
      message || `Direct upload failed with status ${response.status}`
    );
  }
}

async function extractArchive(payload) {
  const response = await fetchWithTimeout(payload.sourceUrl, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new HttpError(
      502,
      `Failed to download ZIP source (${response.status})`
    );
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_ARCHIVE_DOWNLOAD_BYTES
  ) {
    throw new HttpError(
      413,
      'ZIP archive exceeds maximum allowed download size.'
    );
  }

  const reader = response.body?.getReader();

  if (!reader) {
    throw new HttpError(502, 'Failed to read ZIP archive response body.');
  }

  const chunks = [];
  let downloadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    downloadedBytes += value.byteLength;
    if (downloadedBytes > MAX_ARCHIVE_DOWNLOAD_BYTES) {
      await reader.cancel().catch(() => {});
      throw new HttpError(
        413,
        'ZIP archive exceeds maximum allowed download size.'
      );
    }

    chunks.push(Buffer.from(value));
  }

  const archiveBuffer = Buffer.concat(chunks, downloadedBytes);
  const archive = await unzipper.Open.buffer(archiveBuffer);
  if (archive.files.length > MAX_ARCHIVE_ENTRIES) {
    throw new HttpError(413, 'ZIP archive contains too many entries.');
  }

  let files = 0;
  let folders = 0;
  let totalExtractedBytes = 0;

  for (const entry of archive.files) {
    const targetPath = joinArchivePath(payload.destinationPrefix, entry.path);

    if (!targetPath) {
      continue;
    }

    if (entry.type === 'Directory') {
      await postExtractedEntry({
        body: '',
        callbackToken: payload.callbackToken,
        callbackUrl: payload.callbackUrl,
        filePath: targetPath,
        operation: 'folder',
        contentType: 'text/plain',
      });
      folders += 1;
      continue;
    }

    const declaredEntrySize = Number(entry.uncompressedSize ?? 0);
    if (
      Number.isFinite(declaredEntrySize) &&
      declaredEntrySize > MAX_EXTRACTED_ENTRY_BYTES
    ) {
      throw new HttpError(
        413,
        `ZIP entry "${entry.path}" exceeds the allowed size.`
      );
    }

    if (
      Number.isFinite(declaredEntrySize) &&
      totalExtractedBytes + declaredEntrySize > MAX_TOTAL_EXTRACTED_BYTES
    ) {
      throw new HttpError(
        413,
        'Extracted archive exceeds the total allowed size.'
      );
    }

    const body = await entry.buffer();
    if (body.byteLength > MAX_EXTRACTED_ENTRY_BYTES) {
      throw new HttpError(
        413,
        `ZIP entry "${entry.path}" exceeds the allowed size.`
      );
    }

    totalExtractedBytes += body.byteLength;
    if (totalExtractedBytes > MAX_TOTAL_EXTRACTED_BYTES) {
      throw new HttpError(
        413,
        'Extracted archive exceeds the total allowed size.'
      );
    }

    const contentType = contentTypeForFile(entry.path);
    const uploadPayload = await requestExtractedFileUpload({
      callbackToken: payload.callbackToken,
      callbackUrl: payload.callbackUrl,
      contentType,
      filePath: targetPath,
      size: body.byteLength,
    });
    await uploadExtractedFile({
      body,
      contentType,
      uploadPayload,
    });
    files += 1;
  }

  return {
    files,
    folders,
    message: `Extracted ${files} file(s) and ${folders} folder(s).`,
  };
}

Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true });
    }

    if (request.method !== 'POST' || url.pathname !== '/extract') {
      return json({ message: 'Not found' }, { status: 404 });
    }

    if (!SHARED_TOKEN || getBearerToken(request) !== SHARED_TOKEN) {
      return json({ message: 'Unauthorized' }, { status: 401 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ message: 'Invalid request body' }, { status: 400 });
    }

    if (
      typeof payload?.sourceUrl !== 'string' ||
      typeof payload?.callbackUrl !== 'string' ||
      typeof payload?.callbackToken !== 'string'
    ) {
      return json({ message: 'Invalid request body' }, { status: 400 });
    }

    const sourceUrl = parseHttpUrl(payload.sourceUrl);
    const callbackUrl = parseHttpUrl(payload.callbackUrl);

    if (!sourceUrl || !callbackUrl) {
      return json({ message: 'Invalid request body' }, { status: 400 });
    }

    try {
      const destinationPrefix =
        typeof payload.destinationPrefix === 'string'
          ? payload.destinationPrefix
          : '';

      if (destinationPrefix && !normalizeZipEntryPath(destinationPrefix)) {
        return json({ message: 'Invalid destination prefix' }, { status: 400 });
      }

      const result = await extractArchive({
        callbackToken: payload.callbackToken,
        callbackUrl: callbackUrl.toString(),
        destinationPrefix,
        sourceUrl: sourceUrl.toString(),
      });

      return json(result);
    } catch (error) {
      return json(
        {
          message:
            error instanceof Error
              ? error.message
              : 'Failed to extract ZIP archive',
        },
        {
          status:
            error instanceof HttpError && typeof error.status === 'number'
              ? error.status
              : 500,
        }
      );
    }
  },
});
