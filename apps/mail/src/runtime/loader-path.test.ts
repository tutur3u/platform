// @vitest-environment jsdom
// The owning config discovers .test.ts; include the JSX adapter regression here.
import './mail-workspace-view.test';
import type { ZodType } from 'zod';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  transport: vi.fn<(input: { data: unknown }) => Promise<unknown>>(),
  model: vi.fn(async (path: string) => ({ path })),
  loaders: new Map<
    string,
    (input: { location: { href: string } }) => unknown
  >(),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    (path: string) =>
    (options: {
      loader: (input: { location: { href: string } }) => unknown;
    }) => {
      mocks.loaders.set(path, options.loader);
      return options;
    },
}));
// Execute the real page-loader validator at the server-function boundary.
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (schema: ZodType<{ path: string }>) => ({
      handler: (run: (input: { data: { path: string } }) => unknown) => {
        mocks.transport.mockImplementation(async ({ data }) =>
          run({ data: schema.parse(data) })
        );
        return mocks.transport;
      },
    }),
  }),
}));
vi.mock('./page-model.server', () => ({ loadPageModel: mocks.model }));
vi.mock('./page-head', () => ({ mailPageHead: vi.fn() }));
vi.mock('./page-view', () => ({ PageView: () => null }));
vi.mock('./providers', () => ({ AppProviders: () => null }));
import '../routes/$';
import '../routes/index';
import { mailLoaderPath } from './loader-path';
beforeEach(() => {
  mocks.transport.mockClear();
  mocks.model.mockClear();
});
it.each(['/$', '/'])(
  'drops the handoff before the real %s loader invokes server transport',
  async (path) => {
    const href =
      '/vi/workspace/inbox?account=a%2Bb#meet-mail=private%40example.invalid%20body';
    const loader = mocks.loaders.get(path);
    expect(loader).toBeTypeOf('function');
    expect(await loader?.({ location: { href } })).toEqual({
      path: '/vi/workspace/inbox?account=a%2Bb',
    });
    expect(mocks.transport).toHaveBeenCalledExactlyOnceWith({
      data: { path: '/vi/workspace/inbox?account=a%2Bb' },
    });
    expect(mocks.model).toHaveBeenCalledExactlyOnceWith(
      '/vi/workspace/inbox?account=a%2Bb'
    );
    expect(JSON.stringify(mocks.transport.mock.calls)).not.toContain('private');
    expect(JSON.stringify(mocks.transport.mock.calls)).not.toContain('body');
  }
);
it.each([
  '/',
  '/en/personal/inbox',
  '/mail/vi/workspace/inbox?x=%23tag&x=a+b',
  '/vi/ws/inbox?q=Tiếng+Việt',
])('preserves literal path, locale, workspace, mount and query %s', (path) => {
  expect(mailLoaderPath(path + '#meet-mail=private#body')).toBe(path);
  expect(mailLoaderPath(path)).toBe(path);
});
it.each(['/$', '/'])(
  'retains existing %s validator refusals after client projection',
  async (path) => {
    for (const href of [
      '//foreign.test/inbox#private',
      'https://foreign.test/inbox#private',
      '/' + 'x'.repeat(8192) + '#private',
    ]) {
      await expect(
        mocks.loaders.get(path)?.({ location: { href } })
      ).rejects.toThrow();
    }
    expect(mocks.model).not.toHaveBeenCalled();
    for (const [input] of mocks.transport.mock.calls)
      expect(JSON.stringify(input)).not.toContain('private');
  }
);
it.each(['/$', '/'])(
  'removes a long fragment before the real %s server validator sees length',
  async (path) => {
    const href = '/en/personal/inbox#meet-mail=' + 'private-body'.repeat(1000);
    expect(await mocks.loaders.get(path)?.({ location: { href } })).toEqual({
      path: '/en/personal/inbox',
    });
    expect(mocks.transport).toHaveBeenCalledExactlyOnceWith({
      data: { path: '/en/personal/inbox' },
    });
  }
);
