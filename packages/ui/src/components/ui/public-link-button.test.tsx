// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PublicLinkButton } from './public-link-button';

vi.mock('./button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
vi.mock('./input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
const copy = vi.fn(),
  url = 'https://tuturuuu.com/u/creator';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: copy },
  });
  copy.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
  vi.clearAllMocks();
});
async function render(link: string | null = url) {
  await act(() =>
    root.render(
      <PublicLinkButton
        url={link}
        label="Copy link"
        copiedLabel="Copied"
        errorLabel="Failed"
        manualCopyLabel="Manual link"
      />
    )
  );
}
async function click() {
  await act(() => container.querySelector('button')!.click());
}
it('copies only after an explicit click and announces success', async () => {
  await render();
  expect(copy).not.toHaveBeenCalled();
  expect(container.querySelector('input')).toBeNull();
  await click();
  expect(copy).toHaveBeenCalledWith(url);
  expect(container.querySelector('[role=status]')!.textContent).toBe('Copied');
});
it('excludes invalid/private URLs entirely', async () => {
  await render('https://tuturuuu.com/private/settings');
  expect(container.querySelector('button')).toBeNull();
  expect(copy).not.toHaveBeenCalled();
});
it('supports manual selection and retry after a clipboard denial', async () => {
  await render();
  copy.mockRejectedValueOnce(new Error('Denied'));
  await click();
  expect(container.querySelector('[role=alert]')!.textContent).toBe('Failed');
  const input = container.querySelector('input')!;
  expect(input.value).toBe(url);
  expect(input.readOnly).toBe(true);
  await act(() => input.focus());
  expect(input.selectionEnd).toBe(url.length);
  await click();
  expect(container.querySelector('input')).toBeNull();
  expect(container.querySelector('[role=status]')!.textContent).toBe('Copied');
});
it('provides manual copy when Clipboard API is unavailable', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
  await render();
  await click();
  expect(container.querySelector('input')!.value).toBe(url);
});
it('fences rapid duplicate clicks and suppresses stale success after URL replacement', async () => {
  let finish!: () => void;
  copy.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    })
  );
  await render();
  await act(() => {
    container.querySelector('button')!.click();
    container.querySelector('button')!.click();
  });
  expect(copy).toHaveBeenCalledTimes(1);
  await render('https://tuturuuu.com/u/other');
  await act(() => finish());
  expect(container.querySelector('[role=status]')).toBeNull();
  expect(container.querySelector('input')).toBeNull();
});
it('suppresses stale failure after unmount', async () => {
  let fail!: (error: Error) => void;
  copy.mockReturnValue(
    new Promise<void>((_, reject) => {
      fail = reject;
    })
  );
  await render();
  await act(() => container.querySelector('button')!.click());
  await act(() => root.render(null));
  await act(() => fail(new Error('Denied')));
  expect(container.innerHTML).toBe('');
});
