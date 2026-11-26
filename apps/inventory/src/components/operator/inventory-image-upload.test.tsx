import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InventoryImageUploadField } from './inventory-image-upload';

const WS = '82cf845a-49b0-459d-a5ee-1005e8de4fae';
const IMAGE = 'inventory/media/product-featured-image/upload-id-a.png';
const SIGNED = `https://project.supabase.co/storage/v1/object/sign/workspaces/${WS}/${IMAGE}?token=t`;

const mocks = vi.hoisted(() => ({ uploadInventoryMedia: vi.fn() }));

vi.mock('@tuturuuu/internal-api/inventory', () => ({
  uploadInventoryMedia: (...args: unknown[]) =>
    mocks.uploadInventoryMedia(...args),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  mocks.uploadInventoryMedia.mockResolvedValue({
    fullPath: `${WS}/${IMAGE}`,
    path: IMAGE,
    target: 'product-featured-image',
    url: SIGNED,
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('stores a product upload as a URL the public storefront can render', async () => {
  const onChange = vi.fn();
  // The page may address the workspace by its route slug.
  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <InventoryImageUploadField
          label="Image"
          onChange={onChange}
          target="product-featured-image"
          value=""
          wsId="personal"
        />
      </QueryClientProvider>
    )
  );
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  const file = new File(['png'], 'a.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
  // Database triggers copy the product image to its storefront listings,
  // which anonymous shoppers load directly: the stored value is the signed
  // read URL, never the auth-only share URL.
  const stored = onChange.mock.calls.at(-1)?.[0] as string;
  expect(stored).toBe(SIGNED);
  expect(stored).not.toContain('/storage/share');
});
