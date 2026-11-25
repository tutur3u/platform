import { readFileSync } from 'node:fs';
import { safeErrorFields } from '@tuturuuu/utils/log-safety';
import { describe, expect, it, vi } from 'vitest';
import {
  assetHeadersRules,
  BUILD_STAMP_HEADER,
  buildCommit,
  stampResponse,
  withBuildStamp,
} from './build-stamp';
import { BUILD_COMMIT_DEFINE, buildStamp } from './build-stamp-plugin';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const OTHER = 'fedcba9876543210fedcba9876543210fedcba98';
const THROWN = new Error('render failed');

// Stands in for the vinext handler: one response per path.
const vinext = {
  marker: 'vinext',
  async fetch(request: Request) {
    const { pathname } = new URL(request.url);
    switch (pathname) {
      case '/vi/login':
        return new Response('<html></html>', {
          headers: { 'content-type': 'text/html' },
        });
      case '/personal':
        // Response.redirect has immutable headers, like a fetched response.
        return Response.redirect('https://tuturuuu.com/vi/personal', 307);
      case '/api/v1/infrastructure/devboxes':
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      case '/favicon.ico':
        return new Response(new Uint8Array([0, 0, 1, 0]), {
          headers: {
            'content-type': 'image/x-icon',
            'cache-control': 'public, max-age=31536000, immutable',
          },
        });
      case '/spoof':
        return new Response('ok', { headers: { [BUILD_STAMP_HEADER]: OTHER } });
      case '/throw':
        throw THROWN;
      default:
        return new Response('Not Found', { status: 404 });
    }
  },
};

// A present `commit` key is taken as given, so `{ commit: undefined }` means
// a build without a commit (no default-parameter substitution).
const serve = (path: string, options: { commit?: unknown } = {}) =>
  withBuildStamp(vinext, 'commit' in options ? options.commit : SHA).fetch(
    new Request(`https://tuturuuu.com${path}`, {
      headers: { [BUILD_STAMP_HEADER]: OTHER },
    }),
    {},
    {}
  );

describe('buildCommit', () => {
  it('accepts only a full lowercase commit SHA', () => {
    expect(buildCommit(SHA)).toBe(SHA);
    expect(buildCommit(` ${SHA}\n`)).toBe(SHA);
    for (const value of [
      undefined,
      null,
      '',
      SHA.slice(0, 12),
      SHA.toUpperCase(),
      `${SHA}0`,
      `main ${SHA}`,
      42,
    ]) {
      expect(buildCommit(value), String(value)).toBeNull();
    }
  });
});

describe('withBuildStamp', () => {
  it.each([
    ['/vi/login', 200],
    ['/missing', 404],
    ['/personal', 307],
    ['/api/v1/infrastructure/devboxes', 401],
    ['/favicon.ico', 200],
  ])('stamps %s (%i) with the build commit', async (path, status) => {
    const response = await serve(path);
    expect(response.status).toBe(status);
    expect(response.headers.get(BUILD_STAMP_HEADER)).toBe(SHA);
  });

  it('keeps the response it wraps', async () => {
    const redirect = await serve('/personal');
    expect(redirect.headers.get('location')).toBe(
      'https://tuturuuu.com/vi/personal'
    );
    const asset = await serve('/favicon.ico');
    expect(asset.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
    expect(new Uint8Array(await asset.arrayBuffer())).toEqual(
      new Uint8Array([0, 0, 1, 0])
    );
  });

  it('overwrites an upstream value, ignoring the request header', async () => {
    expect((await serve('/spoof')).headers.get(BUILD_STAMP_HEADER)).toBe(SHA);
  });

  it('omits the header when the build has no commit', async () => {
    for (const commit of [undefined, null, '', 'dev', SHA.slice(0, 12)]) {
      for (const path of ['/vi/login', '/missing', '/spoof']) {
        const response = await serve(path, { commit });
        expect(response.headers.has(BUILD_STAMP_HEADER), path).toBe(false);
      }
    }
  });

  it('logs a thrown error scrubbed and re-throws it unchanged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(serve('/throw')).rejects.toBe(THROWN);
    expect(error).toHaveBeenCalledWith(
      'vinext worker request failed',
      safeErrorFields(THROWN, { message: true })
    );
    expect(error.mock.calls[0]).not.toContain(THROWN);
    error.mockRestore();
  });

  it('treats an explicit undefined commit as no commit', async () => {
    expect(buildCommit(undefined)).toBeNull();
    const response = await serve('/vi/login', { commit: undefined });
    expect(response.headers.has(BUILD_STAMP_HEADER)).toBe(false);
    expect((await serve('/vi/login')).headers.get(BUILD_STAMP_HEADER)).toBe(
      SHA
    );
  });

  it('keeps the other handler members', () => {
    expect(withBuildStamp(vinext, SHA).marker).toBe('vinext');
  });
});

describe('stampResponse', () => {
  it('leaves an upgrade response object in place', () => {
    const upgrade = { status: 101, headers: new Headers() } as Response;
    expect(stampResponse(upgrade, SHA)).toBe(upgrade);
    expect(upgrade.headers.get(BUILD_STAMP_HEADER)).toBe(SHA);
  });

  it('returns a response it cannot copy instead of failing', () => {
    // Copying with an init the runtime rejects (status 0) throws.
    const odd = { status: 0, body: null, headers: new Headers() } as Response;
    expect(stampResponse(odd, SHA)).toBe(odd);
    expect(odd.headers.get(BUILD_STAMP_HEADER)).toBe(SHA);
  });
});

describe('static assets', () => {
  it('writes the _headers rule for Worker-bypassing assets', () => {
    expect(assetHeadersRules(SHA)).toBe(
      `/*\n  ${BUILD_STAMP_HEADER}: ${SHA}\n`
    );
    expect(assetHeadersRules(undefined)).toBe('');
  });

  const generate = (
    commit: unknown,
    environment: string,
    bundle: Record<string, { type: string; source?: string }> = {}
  ) => {
    const plugin = buildStamp(commit);
    const emitted: { fileName: string; source: string }[] = [];
    const hook = plugin.generateBundle;
    if (typeof hook !== 'function') throw new Error('generateBundle missing');
    hook.call(
      {
        environment: { name: environment },
        emitFile: (file: { fileName: string; source: string }) => {
          emitted.push(file);
          return file.fileName;
        },
      } as never,
      {} as never,
      bundle as never,
      false
    );
    return { emitted, bundle };
  };

  it('emits _headers in the client environment only', () => {
    expect(generate(SHA, 'client').emitted).toEqual([
      { type: 'asset', fileName: '_headers', source: assetHeadersRules(SHA) },
    ]);
    expect(generate(SHA, 'rsc').emitted).toEqual([]);
    expect(generate(undefined, 'client').emitted).toEqual([]);
  });

  it('appends to an existing binary _headers asset', () => {
    const { bundle } = generate(SHA, 'client', {
      _headers: {
        type: 'asset',
        source: new TextEncoder().encode('/sw.js\n  X-A: 1\n') as never,
      },
    });
    expect(bundle._headers?.source).toBe(
      `/sw.js\n  X-A: 1\n${assetHeadersRules(SHA)}`
    );
  });

  it('appends to an existing _headers file', () => {
    const { emitted, bundle } = generate(SHA, 'client', {
      _headers: {
        type: 'asset',
        source: '/sw.js\n  Service-Worker-Allowed: /\n',
      },
    });
    expect(emitted).toEqual([]);
    expect(bundle._headers?.source).toBe(
      `/sw.js\n  Service-Worker-Allowed: /\n${assetHeadersRules(SHA)}`
    );
  });

  it('bakes the commit, or an empty value, into the Worker bundle', () => {
    const define = (commit: unknown) => {
      const hook = buildStamp(commit).config;
      if (typeof hook !== 'function') throw new Error('config missing');
      return (hook as () => { define: Record<string, string> })().define[
        BUILD_COMMIT_DEFINE
      ];
    };
    expect(define(SHA)).toBe(JSON.stringify(SHA));
    expect(define('not-a-sha')).toBe('""');
  });
});

describe('build wiring', () => {
  const read = (path: string) =>
    readFileSync(new URL(path, import.meta.url), 'utf8');

  it('passes the full build commit from build-family.sh to the Worker', () => {
    expect(read('./build-family.sh')).toContain(
      'PLATFORM_BUILD_COMMIT="$(git -C "$repo_dir" rev-parse HEAD)"'
    );
    expect(read('../../vite.vinext.config.ts')).toContain(
      'buildStamp(process.env.PLATFORM_BUILD_COMMIT)'
    );
    const entry = read('./worker-entry.ts');
    expect(entry).toContain('withBuildStamp(');
    expect(entry).toContain(BUILD_COMMIT_DEFINE);
  });
});
