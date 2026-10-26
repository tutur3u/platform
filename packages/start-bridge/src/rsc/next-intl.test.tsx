import { lazy, Suspense } from 'react';
import { renderToReadableStream } from 'react-dom/server.edge';
import { describe, expect, it, vi } from 'vitest';
import { loadIntlConfig } from '../intl/next-intl-server';
import { withBridgeRequest } from '../server/request-context';
import { findUnresolvedSuspenseBoundaries } from '../start/suspense-boundaries';
import { NextIntlClientProvider, useTranslations } from './next-intl';

const inRequest = <T,>(work: () => Promise<T>) =>
  withBridgeRequest(
    {
      request: new Request('https://forms.test/'),
      rootParams: { locale: 'vi' },
    },
    work
  );

const later = <T,>(value: T, ms: number) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

function SignedOutCta() {
  const t = useTranslations('common');
  return <a href="/login">{t('hello', { name: 'Forms' })}</a>;
}

describe('RSC next-intl', () => {
  it('reuses one config promise per request', async () => {
    await inRequest(async () => {
      expect(loadIntlConfig()).toBe(loadIntlConfig());
    });
  });

  it('settles the hooks config in the provider before children render', async () => {
    await inRequest(async () => {
      // The provider must settle the hooks' own (locale-less) config, not just
      // the one for its locale prop; read it only after the provider resolves.
      await NextIntlClientProvider({ locale: 'vi', children: null });
      expect(loadIntlConfig()).toMatchObject({
        status: 'fulfilled',
        value: { locale: 'vi' },
      });
    });
  });

  it('warns once in development when a hook runs before the config settles', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'development');
    try {
      await inRequest(async () => {
        const Early = () => (
          <>{useTranslations('common')('hello', { name: 'x' })}</>
        );
        await new Response(await renderToReadableStream(<Early />)).text();
        await new Response(await renderToReadableStream(<Early />)).text();
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain(
        'before NextIntlClientProvider'
      );
    } finally {
      vi.unstubAllEnvs();
      warn.mockRestore();
    }
  });

  it('keeps a translated Suspense fallback inline so every streamed boundary resolves', async () => {
    // The Forms CTA shape: a late section holds a Suspense whose fallback is
    // translated and whose session-dependent child streams in afterwards.
    const Session = lazy(() =>
      later({ default: () => <a href="/dashboard">workspace</a> }, 30)
    );
    const Section = lazy(() =>
      later(
        {
          default: () => (
            <section>
              <Suspense fallback={<SignedOutCta />}>
                <Session />
              </Suspense>
            </section>
          ),
        },
        5
      )
    );

    const html = await inRequest(async () => {
      await NextIntlClientProvider({ locale: 'vi', children: null });
      const stream = await renderToReadableStream(
        <html lang="vi">
          <body>
            <Suspense fallback={<i>loading</i>}>
              <Section />
            </Suspense>
          </body>
        </html>
      );
      return new Response(stream).text();
    });

    expect(html).toContain('Xin chào Forms');
    expect(html).toContain('href="/dashboard"');
    expect(findUnresolvedSuspenseBoundaries(html)).toEqual([]);
  });
});
