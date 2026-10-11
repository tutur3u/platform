import app from '../../cloudflare/worker';

// This fixture must never fall back to a hosted API or provider.
globalThis.fetch = async () => {
  throw new Error('Built Parley fixture forbids outbound fetch');
};

export default {
  /** Forward through the production entry with a canonical host and local bindings. */
  fetch(
    request: Request,
    env: Parameters<typeof app.fetch>[1],
    ctx: ExecutionContext
  ) {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.host = 'parley.tuturuuu.com';
    const headers = new Headers(request.headers);
    headers.set('Host', url.host);
    return app.fetch(
      new Request(url, { method: request.method, headers }),
      env,
      ctx
    );
  },
};
