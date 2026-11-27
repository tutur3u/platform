import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const api = 'https://api.cloudflare.com';

// Wrangler still prepares modules, assets, migrations and bindings. Only this
// connection may send the script PUT, and it is consumed before forwarding.
export async function withFirstUploadGate(
  { scriptPath, versionTag, token, fetcher = fetch },
  run
) {
  let uploaded = false;
  let servingChanged = false;
  let assetWrites = 0;
  const accountPath = scriptPath.split('/workers/scripts/')[0];
  const server = createServer(async (incoming, outgoing) => {
    const fail = (status) => {
      if (outgoing.headersSent) return outgoing.destroy();
      outgoing.writeHead(status, { 'content-type': 'application/json' });
      outgoing.end(
        JSON.stringify({
          success: false,
          errors: [
            { code: 10000, message: 'First upload gate refused the request' },
          ],
        })
      );
    };
    try {
      const url = new URL(incoming.url, api);
      assert.equal(url.origin, api);
      assert.ok(url.pathname.startsWith(accountPath + '/'));
      const method = incoming.method;
      const headers = new Headers();
      for (const name of [
        'authorization',
        'content-type',
        'accept',
        'user-agent',
      ])
        if (incoming.headers[name]) headers.set(name, incoming.headers[name]);
      let body;
      const assetWrite =
        method === 'POST' &&
        (url.pathname === `${scriptPath}/assets-upload-session` ||
          url.pathname === `${accountPath}/workers/assets/upload`);
      const servingWrite =
        method === 'POST' &&
        uploaded &&
        url.pathname === `${scriptPath}/subdomain`;
      if (method === 'PUT' && url.pathname === scriptPath) {
        if (uploaded || headers.get('authorization') !== `Bearer ${token}`)
          return fail(400);
        uploaded = true;
        const bounded = [];
        let bytes = 0;
        for await (const chunk of incoming) {
          bytes += chunk.length;
          assert.ok(bytes <= 64 * 1024 * 1024);
          bounded.push(chunk);
        }
        const multipart = await new Response(Buffer.concat(bounded), {
          headers,
        }).formData();
        const part = multipart.get('metadata');
        const metadata = JSON.parse(
          typeof part === 'string' ? part : await part.text()
        );
        metadata.annotations = {
          ...metadata.annotations,
          'workers/tag': versionTag,
          'workers/message': versionTag,
        };
        multipart.set(
          'metadata',
          new Blob([JSON.stringify(metadata)], { type: 'application/json' })
        );
        headers.delete('content-type');
        body = multipart;
      } else if (assetWrite) {
        if (uploaded || ++assetWrites > 32) return fail(400);
        body = incoming;
      } else if (servingWrite) {
        if (
          servingChanged ||
          headers.get('authorization') !== `Bearer ${token}`
        )
          return fail(400);
        servingChanged = true;
        body = incoming;
      } else if (method !== 'GET') {
        return fail(400);
      }
      const response = await fetcher(url, {
        method,
        headers,
        body,
        ...(body === incoming ? { duplex: 'half' } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(90_000),
      });
      outgoing.writeHead(response.status, {
        'content-type':
          response.headers.get('content-type') ?? 'application/json',
      });
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      fail(502);
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    return await run(`http://127.0.0.1:${server.address().port}/client/v4`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

export async function runFirstUpload(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['pipe', 'ignore', 'ignore'],
    timeout: options.timeout,
  });
  child.stdin.on('error', () => {});
  child.stdin.end(options.input);
  const [exit] = await once(child, 'close');
  assert.equal(exit, 0, 'Wrangler first upload failed');
}
