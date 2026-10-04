import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SalePickerPagination } from './sale-picker-pagination';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const observers: Observer[] = [];
class Observer {
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(
    public callback: IntersectionObserverCallback,
    public options: IntersectionObserverInit
  ) {
    observers.push(this);
  }
  intersect(near = true) {
    this.callback(
      [{ isIntersecting: near }] as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver
    );
  }
}
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('IntersectionObserver', Observer);
  observers.length = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function render(
  fetchNextPage: () => unknown,
  props: Partial<React.ComponentProps<typeof SalePickerPagination>> = {}
) {
  act(() =>
    root.render(
      <div data-testid="scroll-root">
        <SalePickerPagination
          fetchNextPage={fetchNextPage}
          hasNextPage
          isFetchingNextPage={false}
          loadVersion={1}
          {...props}
        />
      </div>
    )
  );
}
it('roots near-end observation in the list and deduplicates callbacks before loading props update', async () => {
  let finish!: () => void;
  const fetch = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  render(fetch);
  const observer = observers.at(-1)!;
  expect(observer.options.root).toBe(container.firstElementChild);
  expect(observer.options.rootMargin).toBe('0px 0px 200px 0px');
  await act(async () => {
    observer.intersect(false);
  });
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => {
    observer.intersect();
    observer.intersect();
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
  });
  render(fetch, { isFetchingNextPage: true });
  await act(async () => observer.intersect());
  expect(fetch).toHaveBeenCalledTimes(1);
  render(fetch, { hasNextPage: false });
  expect(container.querySelector('button')).toBeNull();
});
it('autofills a short list and rearms on page version even when visible rows stay unchanged', async () => {
  const fetch = vi.fn().mockResolvedValue({ isError: false });
  render(fetch);
  await act(async () => observers.at(-1)!.intersect());
  expect(fetch).toHaveBeenCalledTimes(1);
  render(fetch, { loadVersion: 2 });
  await act(async () => observers.at(-1)!.intersect());
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each(['throw', 'resolved'] as const)(
  'stops automatic retries on %s errors and leaves accessible manual retry',
  async (mode) => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(() =>
        mode === 'throw'
          ? Promise.reject(new Error('synthetic'))
          : Promise.resolve({ isError: true })
      )
      .mockResolvedValue({ isError: false });
    render(fetch);
    const old = observers.at(-1)!;
    await act(async () => old.intersect());
    await act(async () => old.intersect());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'loadMoreError'
    );
    await act(async () => container.querySelector('button')!.click());
    expect(fetch).toHaveBeenCalledTimes(2);
  }
);
it('respects the selected query error and fences stale callbacks after unmount', async () => {
  const fetch = vi.fn().mockResolvedValue(undefined);
  render(fetch, { isError: true });
  expect(observers).toHaveLength(0);
  await act(async () => container.querySelector('button')!.click());
  expect(fetch).toHaveBeenCalledTimes(1);
  render(fetch);
  const old = observers.at(-1)!;
  act(() => root.render(null));
  await act(async () => old.intersect());
  expect(old.disconnect).toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('keeps a manual fallback without IntersectionObserver', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const fetch = vi.fn().mockResolvedValue(undefined);
  render(fetch);
  await act(async () => container.querySelector('button')!.click());
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(observers).toHaveLength(0);
});

it('allows an initial-query error retry without a next page and never starts it automatically', async () => {
  let finish!: () => void;
  const fetch = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  render(fetch, { hasNextPage: false, isError: true });
  expect(observers).toHaveLength(0);
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'loadMoreError'
  );
  await act(async () => {
    container.querySelector('button')!.click();
    container.querySelector('button')!.click();
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  render(fetch, { hasNextPage: false, isError: false });
  expect(container.querySelector('button')).toBeNull();
  expect(observers).toHaveLength(0);
  expect(fetch).toHaveBeenCalledTimes(1);
});
