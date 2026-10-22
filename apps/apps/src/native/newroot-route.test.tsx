import type { RootRouteOptions } from '@tanstack/react-router';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
import type { loadGatewayData } from './page-data.server';

type Data = Awaited<ReturnType<typeof loadGatewayData>>;
type Options = typeof import('../routes/__root').Route.options;
type Head = NonNullable<Options['head']>;
type Loader = Extract<
  NonNullable<Options['loader']>,
  (...args: never[]) => unknown
>;
type Registration = {
  loader: () => ReturnType<Loader>;
  head: (context: Pick<Parameters<Head>[0], 'loaderData'>) => ReturnType<Head>;
  component: NonNullable<Options['component']>;
  shellComponent: NonNullable<RootRouteOptions['shellComponent']>;
  notFoundComponent: NonNullable<Options['notFoundComponent']>;
};

// Capture the real callbacks at the router registration port; no callback result is mocked.
const router = vi.hoisted(() => {
  let registration: Registration | undefined;
  let data: Data | undefined;
  return {
    register(options: Registration) {
      registration = options;
      return { useLoaderData: () => data };
    },
    options() {
      if (!registration) throw new Error('Expected the Apps root registration');
      return registration;
    },
    setData(value: Data | undefined) {
      data = value;
    },
  };
});
const loadGateway = vi.hoisted(() =>
  vi.fn<() => ReturnType<typeof import('./page-data').loadGateway>>()
);
const provider = vi.hoisted(() =>
  vi.fn(
    ({
      children,
    }: Parameters<typeof import('./providers').GatewayProviders>[0]) => children
  )
);
vi.mock('@tanstack/react-router', () => ({
  createRootRoute: router.register,
  HeadContent: () => <meta name="fixture-head" content="attached" />,
  Scripts: () => <script data-fixture-script="attached" />,
  Outlet: () => <span data-testid="route-outlet">Child route content</span>,
}));
vi.mock('./providers', () => ({ GatewayProviders: provider }));
// The server function transport and shared error UI are outside these callback tests.
vi.mock('./page-data', () => ({ loadGateway }));
vi.mock('@tuturuuu/ui/custom/app-error-boundary', () => ({
  AppErrorBoundary: () => null,
}));

import '../routes/__root';

afterEach(() => {
  cleanup();
  provider.mockClear();
  loadGateway.mockReset();
  router.setData(undefined);
});

function data(locale: Data['locale']): Data {
  return { locale, actorId: 'fixture-actor', release: null };
}
const cases: {
  name: string;
  input: Data | undefined;
  locale: Data['locale'];
  og: string;
  alternate: string;
}[] = [
  {
    name: 'English',
    input: data('en'),
    locale: 'en',
    og: 'en_US',
    alternate: 'vi_VN',
  },
  {
    name: 'Vietnamese',
    input: data('vi'),
    locale: 'vi',
    og: 'vi_VN',
    alternate: 'en_US',
  },
  {
    name: 'absent loader data',
    input: undefined,
    locale: 'en',
    og: 'en_US',
    alternate: 'vi_VN',
  },
];

describe('actual Apps root route callbacks', () => {
  it.each(['en', 'vi'] satisfies Data['locale'][])(
    'returns the exact %s gateway result from one transport call',
    async (locale) => {
      const loaded = data(locale);
      loadGateway.mockResolvedValueOnce(loaded);

      await expect(router.options().loader()).resolves.toBe(loaded);

      expect(loadGateway).toHaveBeenCalledTimes(1);
      expect(loadGateway).toHaveBeenCalledWith();
    }
  );

  it('propagates the exact gateway rejection without fallback data or retry', async () => {
    const failure = new Error('Gateway transport failed');
    loadGateway.mockRejectedValueOnce(failure);

    await expect(router.options().loader()).rejects.toBe(failure);

    expect(loadGateway).toHaveBeenCalledTimes(1);
    expect(loadGateway).toHaveBeenCalledWith();
  });

  it.each(cases)(
    'emits $name metadata with fixed canonical URL and reciprocal OG locales',
    async ({ input, locale, og, alternate }) => {
      const head = await router.options().head({ loaderData: input });
      if (!head) throw new Error('Expected Apps metadata');
      const copy = (locale === 'vi' ? vietnamese : en).appsGateway.metadata;
      expect(head.meta).toEqual(
        expect.arrayContaining([
          { title: copy.title },
          { name: 'description', content: copy.description },
          { property: 'og:title', content: copy.title },
          { property: 'og:description', content: copy.description },
          { property: 'og:site_name', content: 'Tuturuuu Apps' },
          { property: 'og:type', content: 'website' },
          { property: 'og:url', content: 'https://apps.tuturuuu.com/' },
          { property: 'og:locale', content: og },
          { property: 'og:locale:alternate', content: alternate },
          { name: 'twitter:title', content: copy.title },
          { name: 'twitter:description', content: copy.description },
        ])
      );
      expect(head.links?.filter((link) => link?.rel === 'canonical')).toEqual([
        { rel: 'canonical', href: 'https://apps.tuturuuu.com/' },
      ]);
      expect(
        head.meta?.filter(
          (item) => item && 'property' in item && item.property === 'og:locale'
        )
      ).toHaveLength(1);
      expect(
        head.meta?.filter(
          (item) =>
            item &&
            'property' in item &&
            item.property === 'og:locale:alternate'
        )
      ).toHaveLength(1);
    }
  );

  it.each(cases)(
    'renders the $name document language and preserves child/head/script slots',
    ({ input, locale }) => {
      router.setData(input);
      const Document = router.options().shellComponent;
      const child: ReactNode = (
        <main data-page-child="retained">Loaded page body</main>
      );
      const markup = renderToStaticMarkup(<Document>{child}</Document>);
      const document = new DOMParser().parseFromString(markup, 'text/html');
      expect(document.documentElement.lang).toBe(locale);
      expect(
        document.body.querySelector('[data-page-child="retained"]')?.textContent
      ).toBe('Loaded page body');
      expect(
        document.head
          .querySelector('meta[name="fixture-head"]')
          ?.getAttribute('content')
      ).toBe('attached');
      expect(
        document.body.querySelector('script[data-fixture-script]')
      ).not.toBeNull();
    }
  );

  it.each(['en', 'vi'] satisfies Data['locale'][])(
    'passes %s loader data and actual outlet children through GatewayProviders',
    (locale) => {
      const loaded = data(locale);
      router.setData(loaded);
      const Root = router.options().component;
      const view = render(<Root />);
      expect(provider).toHaveBeenCalledTimes(1);
      expect(provider.mock.calls[0]?.[0].data).toBe(loaded);
      expect(view.getByTestId('route-outlet').textContent).toBe(
        'Child route content'
      );
    }
  );

  it.each(cases)(
    'renders the $name 404 with the translated catalogue home link',
    ({ input, locale }) => {
      router.setData(input);
      const Missing = router.options().notFoundComponent;
      const view = render(<Missing isNotFound routeId="__root__" />);
      expect(view.getByRole('heading', { level: 1 }).textContent).toBe('404');
      const title = (locale === 'vi' ? vietnamese : en).appsGateway.metadata
        .title;
      expect(view.getByRole('link', { name: title }).getAttribute('href')).toBe(
        '/'
      );
      expect(view.getAllByRole('link')).toHaveLength(1);
    }
  );
});
