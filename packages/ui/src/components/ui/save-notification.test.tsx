import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { notifySave } from './save-notification';
import { Toaster, toast } from './sonner';

afterEach(() => {
  toast.dismiss();
  vi.unstubAllGlobals();
});

it('renders persistent save failures in the toaster used by app layouts', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
  render(<Toaster />);
  act(() => {
    notifySave({
      title: 'Save failed',
      description: 'Your draft is preserved. Try again.',
      variant: 'destructive',
      duration: Number.POSITIVE_INFINITY,
    });
  });
  expect(await screen.findByText('Save failed')).toBeInTheDocument();
  expect(
    screen.getByText('Your draft is preserved. Try again.')
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Close toast' })
  ).toBeInTheDocument();
});
