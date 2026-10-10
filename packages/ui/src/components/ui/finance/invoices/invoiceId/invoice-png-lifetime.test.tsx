import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useWorkspaceActor,
  WorkspaceVisibilityProvider,
} from '../../../../../hooks/use-workspace-visibility';
import InvoiceCard from './invoice-card';

const notices = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const translate = vi.hoisted(() => (key: string) => key);
vi.mock('next-intl', () => ({ useTranslations: () => translate }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: notices }));
const renderer = vi.fn();
const importStarted = vi.fn();
const downloads: string[] = [];
let lease: ReturnType<typeof useWorkspaceActor>;
function Witness() {
  lease = useWorkspaceActor();
  return null;
}
function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function canvas() {
  return {
    toBlob: (callback: BlobCallback) =>
      callback(new Blob(['synthetic PNG'], { type: 'image/png' })),
  };
}
function invoice(id: string): ComponentProps<typeof InvoiceCard>['invoice'] {
  return {
    id,
    category_id: 'synthetic-category',
    completed_at: null,
    creator_id: null,
    customer_id: null,
    note: null,
    notice: null,
    paid_amount: 0,
    platform_creator_id: null,
    subscription_months: null,
    transaction_id: null,
    valid_until: null,
    wallet_id: 'synthetic-wallet',
    ws_id: 'synthetic-workspace',
    created_at: '2026-10-01T10:00:00Z',
    price: 100,
    total_diff: 0,
    customer_display_name: `Customer ${id}`,
    customer_full_name: null,
    wallet: null,
    creator: null,
  };
}
function mount(
  options: {
    actor?: string | null;
    ws?: string;
    invoiceWs?: string;
    auto?: boolean;
  } = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const content = (actor: string | null, id: string, customerName?: string) => {
    const body = (
      <>
        <Witness />
        <InvoiceCard
          wsId={options.ws ?? 'synthetic-workspace'}
          lang="en"
          configs={[]}
          invoice={{
            ...invoice(id),
            ws_id: options.invoiceWs ?? 'synthetic-workspace',
            customer_display_name: customerName ?? `Customer ${id}`,
          }}
          products={[]}
          promotions={[]}
        />
      </>
    );
    return (
      <QueryClientProvider client={client}>
        {actor !== null ? (
          <WorkspaceVisibilityProvider actorId={actor}>
            {body}
          </WorkspaceVisibilityProvider>
        ) : (
          body
        )}
      </QueryClientProvider>
    );
  };
  if (options.auto) window.history.replaceState({}, '', '/?image=true');
  const view = render(
    content(
      options.actor === undefined ? 'account-A' : options.actor,
      'synthetic-A'
    )
  );
  return {
    ...view,
    redraw: (
      actor: string | null = 'account-A',
      id = 'synthetic-A',
      customerName?: string
    ) => view.rerender(content(actor, id, customerName)),
  };
}
async function exportPng() {
  const openAction = screen.queryByRole('menuitem', {
    name: 'invoices.download_image',
  });
  if (openAction) {
    fireEvent.click(openAction);
    return;
  }
  await screen.findByRole('tab', { name: 'invoices.full' });
  fireEvent.pointerDown(screen.getByRole('button', { name: 'common.export' }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'invoices.download_image' })
  );
}
beforeEach(() => {
  vi.resetModules();
  renderer.mockReset().mockResolvedValue(canvas());
  importStarted.mockReset();
  notices.success.mockReset();
  notices.error.mockReset();
  downloads.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected synthetic export network request');
    })
  );
  // biome-ignore lint/suspicious/noDocumentCookie: Synthetic finance visibility fixture.
  document.cookie = 'finance-confidential-mode=false;path=/';
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.doMock('html2canvas-pro', () => {
    importStarted();
    return { default: renderer };
  });
  const NativeURL = URL;
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:synthetic-png');
      static revokeObjectURL = vi.fn();
    }
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    downloads.push(this.download);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock('html2canvas-pro');
});

describe('actual invoice card PNG export account and invoice lifetime', () => {
  it('invalidates a held capture when actual confidential amount visibility changes', async () => {
    const result = held<ReturnType<typeof canvas>>();
    renderer.mockReturnValue(result.promise);
    mount();
    await exportPng();
    await waitFor(() => expect(renderer).toHaveBeenCalledOnce());
    act(() => {
      // biome-ignore lint/suspicious/noDocumentCookie: Real visibility hook reads this synthetic fixture.
      document.cookie = 'finance-confidential-mode=true;path=/';
      window.dispatchEvent(new Event('finance-confidential-mode-change'));
    });
    await waitFor(() =>
      expect(screen.getAllByText('•••••').length).toBeGreaterThan(0)
    );
    await act(async () => {
      result.resolve(canvas());
      await result.promise;
    });
    expect(downloads).toEqual([]);
    expect(notices.success).not.toHaveBeenCalled();
    expect(notices.error).not.toHaveBeenCalled();
  });

  it('does not capture replacement invoice DOM after a held renderer import', async () => {
    const module = held<{ default: typeof renderer }>();
    vi.doMock('html2canvas-pro', () => {
      importStarted();
      return module.promise;
    });
    const view = mount();
    await exportPng();
    await waitFor(() => expect(importStarted).toHaveBeenCalledOnce());
    view.redraw('account-A', 'synthetic-B');
    expect(screen.getByText('Customer synthetic-B')).toBeVisible();
    await act(async () => {
      module.resolve({ default: renderer });
      await module.promise;
    });
    expect(renderer).not.toHaveBeenCalled();
    expect(downloads).toEqual([]);
    expect(notices.success).not.toHaveBeenCalled();
    expect(notices.error).not.toHaveBeenCalled();
  });
  it('does not finish a held render for a replaced invoice', async () => {
    const renderResult = held<ReturnType<typeof canvas>>();
    renderer.mockReturnValueOnce(renderResult.promise);
    const view = mount();
    await exportPng();
    await waitFor(() => expect(renderer).toHaveBeenCalledOnce());
    view.redraw('account-A', 'synthetic-B');
    await act(async () => {
      renderResult.resolve(canvas());
      await renderResult.promise;
    });
    expect(downloads).toEqual([]);
    expect(notices.success).not.toHaveBeenCalled();
    expect(notices.error).not.toHaveBeenCalled();
  });
  for (const boundary of ['replacement', 'ABA', 'unmount'] as const) {
    it(`does not finish a held render after actor ${boundary}`, async () => {
      const renderResult = held<ReturnType<typeof canvas>>();
      renderer.mockReturnValueOnce(renderResult.promise);
      const view = mount();
      await exportPng();
      await waitFor(() => expect(renderer).toHaveBeenCalledOnce());
      const expired = lease;
      if (boundary === 'unmount') view.unmount();
      else {
        view.redraw('account-B');
        if (boundary === 'ABA') {
          await act(async () => {
            await Promise.resolve();
          });
          view.redraw('account-A');
        }
      }
      expect(() => expired?.assertActive()).toThrow(
        'Workspace account changed'
      );
      await act(async () => {
        renderResult.resolve(canvas());
        await renderResult.promise;
      });
      expect(downloads).toEqual([]);
      expect(notices.success).not.toHaveBeenCalled();
      expect(notices.error).not.toHaveBeenCalled();
    });
  }
  it('does not finish a held blob conversion after invoice replacement', async () => {
    let deliver!: BlobCallback;
    renderer.mockResolvedValueOnce({
      toBlob: (callback: BlobCallback) => {
        deliver = callback;
      },
    });
    const view = mount();
    await exportPng();
    await waitFor(() => expect(deliver).toBeTypeOf('function'));
    view.redraw('account-A', 'synthetic-B');
    await act(async () => {
      deliver(new Blob(['synthetic PNG'], { type: 'image/png' }));
      await Promise.resolve();
    });
    expect(downloads).toEqual([]);
    expect(notices.success).not.toHaveBeenCalled();
    expect(notices.error).not.toHaveBeenCalled();
  });
  it('does not notify a replacement actor about an old renderer failure', async () => {
    const renderResult = held<ReturnType<typeof canvas>>();
    renderer.mockReturnValueOnce(renderResult.promise);
    const view = mount();
    await exportPng();
    await waitFor(() => expect(renderer).toHaveBeenCalledOnce());
    view.redraw('account-B');
    await act(async () => {
      renderResult.reject(new Error('Synthetic renderer failure'));
    });
    expect(downloads).toEqual([]);
    expect(notices.error).not.toHaveBeenCalled();
  });
  it('exports the actual current invoice with the correct filename and element', async () => {
    mount();
    await exportPng();
    await waitFor(() => expect(downloads).toEqual(['invoice-synthetic_a.png']));
    expect(renderer).toHaveBeenCalledOnce();
    expect(renderer.mock.calls[0]?.[0]).toBe(
      document.getElementById('printable-area')
    );
    expect(notices.success).toHaveBeenCalledWith('common.export-success');
    expect(notices.error).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-png');
  });
  it('keeps the same invoice export valid across an unchanged rerender', async () => {
    const renderResult = held<ReturnType<typeof canvas>>();
    renderer.mockReturnValueOnce(renderResult.promise);
    const view = mount();
    await exportPng();
    await waitFor(() => expect(renderer).toHaveBeenCalledOnce());
    view.redraw();
    await act(async () => {
      renderResult.resolve(canvas());
      await renderResult.promise;
    });
    expect(downloads).toEqual(['invoice-synthetic_a.png']);
    expect(notices.success).toHaveBeenCalledOnce();
  });
  it('keeps current renderer failure truthful without a download', async () => {
    renderer.mockRejectedValueOnce(
      new Error('Synthetic current renderer failure')
    );
    mount();
    await exportPng();
    await waitFor(() =>
      expect(notices.error).toHaveBeenCalledWith('common.export-error')
    );
    expect(downloads).toEqual([]);
    expect(notices.success).not.toHaveBeenCalled();
  });
  for (const boundary of [
    'missing-provider',
    'missing-actor',
    'missing-workspace',
    'foreign-invoice-workspace',
  ] as const) {
    it(`denies PNG admission for ${boundary}`, async () => {
      mount({
        actor:
          boundary === 'missing-provider'
            ? null
            : boundary === 'missing-actor'
              ? ''
              : 'account-A',
        ws: boundary === 'missing-workspace' ? '' : 'synthetic-workspace',
        invoiceWs:
          boundary === 'foreign-invoice-workspace'
            ? 'other-workspace'
            : undefined,
      });
      await exportPng();
      expect(renderer).not.toHaveBeenCalled();
      expect(importStarted).not.toHaveBeenCalled();
      expect(downloads).toEqual([]);
      expect(notices.error).toHaveBeenCalledOnce();
      expect(notices.error).toHaveBeenCalledWith('common.export-error');
    });
  }
  it('invalidates held rendering when same-invoice content changes', async () => {
    const result = held<ReturnType<typeof canvas>>();
    renderer.mockReturnValueOnce(result.promise);
    const view = mount();
    await exportPng();
    await waitFor(() => expect(renderer).toHaveBeenCalledOnce());
    view.redraw('account-A', 'synthetic-A', 'Updated synthetic customer');
    await act(async () => {
      result.resolve(canvas());
      await result.promise;
    });
    expect(downloads).toEqual([]);
    expect(notices.success).not.toHaveBeenCalled();
    expect(notices.error).not.toHaveBeenCalled();
  });
  it('does not let an old finally clear a new invoice export owner', async () => {
    const old = held<ReturnType<typeof canvas>>();
    const next = held<ReturnType<typeof canvas>>();
    renderer.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const view = mount();
    await exportPng();
    await waitFor(() => expect(renderer).toHaveBeenCalledOnce());
    view.redraw('account-A', 'synthetic-B');
    await exportPng();
    await waitFor(() => expect(renderer).toHaveBeenCalledTimes(2));
    await act(async () => {
      old.resolve(canvas());
      await old.promise;
    });
    const exporting = screen.getByRole('menuitem', {
      name: 'ws-reports.exporting_png',
    });
    expect(exporting).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(exporting);
    expect(renderer).toHaveBeenCalledTimes(2);
    expect(downloads).toEqual([]);
    await act(async () => {
      next.resolve(canvas());
      await next.promise;
    });
    expect(downloads).toEqual(['invoice-synthetic_b.png']);
    expect(notices.success).toHaveBeenCalledOnce();
  });
  it('preserves a new auto-image intent until its own export completes', async () => {
    const old = held<ReturnType<typeof canvas>>();
    const next = held<ReturnType<typeof canvas>>();
    renderer.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const view = mount({ auto: true });
    await waitFor(() => expect(renderer).toHaveBeenCalledOnce());
    view.redraw('account-B', 'synthetic-B');
    await waitFor(() => expect(renderer).toHaveBeenCalledTimes(2));
    await act(async () => {
      old.resolve(canvas());
      await old.promise;
    });
    expect(window.location.search).toBe('?image=true');
    expect(downloads).toEqual([]);
    await act(async () => {
      next.resolve(canvas());
      await next.promise;
    });
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(downloads).toEqual(['invoice-synthetic_b.png']);
    expect(notices.success).toHaveBeenCalledOnce();
  });
});
