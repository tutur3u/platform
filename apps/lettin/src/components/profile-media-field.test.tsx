// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
import { ProfileMediaField } from './profile-media-field';

const optimization = vi.hoisted(() => ({ optimize: vi.fn() }));
// Keep the shipped public lifecycle/client real; only image processing is doubled.
vi.mock('../../../../packages/internal-api/src/profile-media-optimize', () => ({
  optimizeProfileMediaFile: optimization.optimize,
}));

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  optimization.optimize.mockImplementation(
    async () =>
      new File(['optimized'], 'synthetic.webp', { type: 'image/webp' })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function mount(kind: 'avatar' | 'banner', locale = 'en') {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onChange = vi.fn();
  const onPending = vi.fn();
  await act(async () =>
    root.render(
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'vi' ? vietnamese : en}
        timeZone="UTC"
      >
        <ProfileMediaField
          kind={kind}
          disabled={false}
          hasImage={false}
          onPending={onPending}
          onChange={onChange}
        />
      </NextIntlClientProvider>
    )
  );
  const input = container.querySelector('input')!;
  return {
    input,
    container,
    onChange,
    onPending,
    async select() {
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [
          new File(['synthetic'], 'synthetic.png', { type: 'image/png' }),
        ],
      });
      await act(async () =>
        input.dispatchEvent(new Event('change', { bubbles: true }))
      );
    },
    async close() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function transport(kind: 'avatar' | 'banner') {
  const put = deferred();
  const finalize = deferred();
  const calls: { path: string; init?: RequestInit }[] = [];
  const publicUrl = 'https://synthetic-storage.example.invalid/image.webp';
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://synthetic-api.example.invalid')
      .pathname;
    calls.push({ path, init });
    if (path === `/api/v1/users/me/${kind}/upload-url`) {
      const payload = JSON.parse(String(init?.body));
      return Response.json({
        operationId: payload.operationId,
        publicUrl,
        uploadUrl: 'https://synthetic-storage.example.invalid/capability',
      });
    }
    if (path === '/capability') return put.promise;
    if (path === '/api/v1/users/me/banner') return finalize.promise;
    throw new Error('Unexpected synthetic transport request');
  });
  vi.stubGlobal('fetch', fetch);
  return {
    calls,
    publicUrl,
    put,
    finalize,
    async close() {
      await act(async () => {
        put.resolve(new Response(null, { status: 503 }));
        finalize.resolve(
          Response.json({ message: 'Synthetic cleanup' }, { status: 503 })
        );
      });
    },
  };
}

for (const locale of ['en', 'vi']) {
  for (const kind of ['avatar', 'banner'] as const) {
    it(`exposes the exact ${kind} label and separate description in ${locale}`, async () => {
      const field = await mount(kind, locale);
      const messages = locale === 'vi' ? vietnamese.lettin : en.lettin;
      try {
        expect(field.input.labels?.[0]?.textContent?.trim()).toBe(
          messages[
            kind === 'avatar' ? 'profileavatar_url' : 'profilebanner_url'
          ]
        );
        const hint = document.getElementById(
          field.input.getAttribute('aria-describedby')!
        );
        expect(hint?.textContent).toBe(
          messages[kind === 'avatar' ? 'avatarUploadHint' : 'bannerUploadHint']
        );
        expect(field.input.disabled).toBe(false);
      } finally {
        await field.close();
      }
    });
  }
}

it('keeps banner pending through PUT and same-operation finalization', async () => {
  const network = transport('banner');
  const field = await mount('banner');
  try {
    await field.select();
    await act(async () =>
      vi.waitFor(() => expect(network.calls).toHaveLength(2))
    );
    expect(field.onPending).toHaveBeenCalledExactlyOnceWith(true);
    expect(field.onChange).not.toHaveBeenCalled();
    expect(network.calls[1]?.init).toMatchObject({
      method: 'PUT',
      credentials: 'omit',
    });
    await act(async () =>
      network.put.resolve(new Response(null, { status: 200 }))
    );
    await act(async () =>
      vi.waitFor(() => expect(network.calls).toHaveLength(3))
    );
    const ticket = JSON.parse(String(network.calls[0]?.init?.body));
    const finalization = network.calls[2]!;
    expect(finalization.path).toBe('/api/v1/users/me/banner');
    expect(finalization.init?.method).toBe('POST');
    expect(JSON.parse(String(finalization.init?.body))).toEqual({
      action: 'finalize',
      operationId: ticket.operationId,
    });
    expect(ticket.operationId).toEqual(expect.any(String));
    expect(field.onChange).not.toHaveBeenCalled();
    expect(field.onPending).not.toHaveBeenCalledWith(false);
    await act(async () =>
      network.finalize.resolve(Response.json({ success: true }))
    );
    await act(async () =>
      vi.waitFor(() =>
        expect(field.onChange).toHaveBeenCalledExactlyOnceWith(
          network.publicUrl
        )
      )
    );
    expect(field.onPending).toHaveBeenLastCalledWith(false);
    expect(optimization.optimize).toHaveBeenCalledWith(
      expect.any(File),
      'banner'
    );
  } finally {
    await network.close();
    await field.close();
  }
});

it('does not finalize or publish a banner when PUT fails', async () => {
  const network = transport('banner');
  const field = await mount('banner');
  try {
    await field.select();
    await act(async () =>
      vi.waitFor(() => expect(network.calls).toHaveLength(2))
    );
    await act(async () =>
      network.put.resolve(new Response(null, { status: 503 }))
    );
    await act(async () =>
      vi.waitFor(() => expect(field.onPending).toHaveBeenLastCalledWith(false))
    );
    expect(network.calls).toHaveLength(2);
    expect(field.onChange).not.toHaveBeenCalled();
    expect(field.container.querySelector('[role="alert"]')?.textContent).toBe(
      en.lettin.requestFailed
    );
  } finally {
    await network.close();
    await field.close();
  }
});

it('does not publish a banner when finalization fails', async () => {
  const network = transport('banner');
  const field = await mount('banner');
  try {
    await field.select();
    await act(async () =>
      network.put.resolve(new Response(null, { status: 200 }))
    );
    await act(async () =>
      vi.waitFor(() => expect(network.calls).toHaveLength(3))
    );
    await act(async () =>
      network.finalize.resolve(
        Response.json({ message: 'Synthetic unavailable' }, { status: 503 })
      )
    );
    await act(async () =>
      vi.waitFor(() => expect(field.onPending).toHaveBeenLastCalledWith(false))
    );
    expect(field.onChange).not.toHaveBeenCalled();
    expect(field.container.querySelector('[role="alert"]')?.textContent).toBe(
      en.lettin.requestFailed
    );
  } finally {
    await network.close();
    await field.close();
  }
});

it('retains the avatar ticket/PUT path without banner finalization', async () => {
  const network = transport('avatar');
  const field = await mount('avatar');
  try {
    await field.select();
    await act(async () =>
      network.put.resolve(new Response(null, { status: 200 }))
    );
    await act(async () =>
      vi.waitFor(() =>
        expect(field.onChange).toHaveBeenCalledExactlyOnceWith(
          network.publicUrl
        )
      )
    );
    expect(network.calls.map((call) => call.path)).toEqual([
      '/api/v1/users/me/avatar/upload-url',
      '/capability',
    ]);
    expect(field.onPending).toHaveBeenLastCalledWith(false);
    expect(optimization.optimize).toHaveBeenCalledWith(
      expect.any(File),
      'avatar'
    );
  } finally {
    await network.close();
    await field.close();
  }
});

for (const locale of ['en', 'vi']) {
  it(`keeps simultaneous avatar and banner input identities distinct in ${locale}`, async () => {
    const avatar = await mount('avatar', locale);
    const banner = await mount('banner', locale);
    try {
      expect(avatar.input.id).not.toBe(banner.input.id);
      for (const field of [avatar, banner]) {
        expect(field.input.id).not.toBe('');
        expect(field.input.labels).toHaveLength(1);
        expect(field.input.labels?.[0]?.htmlFor).toBe(field.input.id);
      }
    } finally {
      await avatar.close();
      await banner.close();
    }
  });
}
