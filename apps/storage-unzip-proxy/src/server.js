import path from 'node:path';
import unzipper from 'unzipper';

const PORT = Number(process.env.PORT || 8788);
const SHARED_TOKEN = process.env.DRIVE_UNZIP_PROXY_SHARED_TOKEN || '';

const MIME_TYPES = {
  '.csv': 'text/csv',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
};

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

function joinArchivePath(prefix, value) {
  const normalizedValue = normalizeZipEntryPath(value);
  if (!normalizedValue) {
    return null;
  }

  const normalizedPrefix = prefix ? normalizePathSegment(prefix) : '';
  return normalizedPrefix
    ? `${normalizedPrefix}/${normalizedValue}`
    : normalizedValue;
}

function contentTypeForFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_TYPES[extension] || 'application/octet-stream';
}

async function postExtractedEntry({
  body,
  callbackToken,
  callbackUrl,
  filePath,
  operation,
  contentType,
}) {
  const response = await fetch(callbackUrl, {
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
    throw new Error(
      message || `Callback upload failed with status ${response.status}`
    );
  }
}

async function extractArchive(payload) {
  const response = await fetch(payload.sourceUrl, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to download ZIP source (${response.status})`);
  }

  const archive = await unzipper.Open.buffer(
    Buffer.from(await response.arrayBuffer())
  );
  let files = 0;
  let folders = 0;

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

    const body = await entry.buffer();
    await postExtractedEntry({
      body,
      callbackToken: payload.callbackToken,
      callbackUrl: payload.callbackUrl,
      filePath: targetPath,
      operation: 'file',
      contentType: contentTypeForFile(entry.path),
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

    try {
      const result = await extractArchive({
        callbackToken: payload.callbackToken,
        callbackUrl: payload.callbackUrl,
        destinationPrefix:
          typeof payload.destinationPrefix === 'string'
            ? payload.destinationPrefix
            : '',
        sourceUrl: payload.sourceUrl,
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
        { status: 500 }
      );
    }
  },
});
