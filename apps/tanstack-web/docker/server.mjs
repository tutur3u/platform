import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(currentDir, '..');
const clientDir = path.join(appDir, 'dist', 'client');
const serverEntryUrl = pathToFileURL(
  path.join(appDir, 'dist', 'server', 'server.js')
).href;

const host = process.env.HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '7824', 10);
const serverEntry = await import(serverEntryUrl);
const handler = serverEntry.default;

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function getRequestUrl(request) {
  const protocol = request.headers['x-forwarded-proto'] || 'http';
  const hostHeader = request.headers.host || `${host}:${port}`;

  return new URL(request.url || '/', `${protocol}://${hostHeader}`);
}

function getStaticFilePath(url) {
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.includes('\0')) {
    return null;
  }

  const candidate = path.join(clientDir, pathname);
  const relativePath = path.relative(clientDir, candidate);

  if (
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath) ||
    relativePath.length === 0
  ) {
    return null;
  }

  return candidate;
}

async function tryServeStatic(request, response, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false;
  }

  const filePath = getStaticFilePath(url);

  if (!filePath) {
    return false;
  }

  const fileStat = await stat(filePath).catch((error) => {
    if (error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  });

  if (!fileStat?.isFile()) {
    return false;
  }

  response.statusCode = 200;
  response.setHeader(
    'content-type',
    contentTypes.get(path.extname(filePath)) || 'application/octet-stream'
  );
  response.setHeader('content-length', fileStat.size);

  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    response.setHeader('cache-control', 'public, max-age=31536000, immutable');
  }

  if (request.method === 'HEAD') {
    response.end();
    return true;
  }

  createReadStream(filePath).pipe(response);
  return true;
}

function createFetchRequest(request, url) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const init = {
    headers,
    method: request.method,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

async function writeFetchResponse(fetchResponse, nodeResponse) {
  nodeResponse.statusCode = fetchResponse.status;
  nodeResponse.statusMessage = fetchResponse.statusText;

  for (const [name, value] of fetchResponse.headers) {
    nodeResponse.setHeader(name, value);
  }

  if (!fetchResponse.body) {
    nodeResponse.end();
    return;
  }

  Readable.fromWeb(fetchResponse.body).pipe(nodeResponse);
}

const server = createServer(async (request, response) => {
  try {
    const url = getRequestUrl(request);

    if (await tryServeStatic(request, response, url)) {
      return;
    }

    const fetchRequest = createFetchRequest(request, url);
    const fetchResponse = await handler.fetch(fetchRequest);
    await writeFetchResponse(fetchResponse, response);
  } catch (error) {
    response.statusCode = 500;
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.end('Internal Server Error');
    process.stderr.write(`${error?.stack || error}\n`);
  }
});

server.listen(port, host, () => {
  process.stdout.write(`TanStack web server listening on ${host}:${port}\n`);
});
