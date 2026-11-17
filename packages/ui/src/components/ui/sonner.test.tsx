import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from './sonner';

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

describe('shared Toaster', () => {
  afterEach(() => {
    act(() => {
      toast.dismiss();
    });
  });

  it.each([
    ['success', 'lucide-circle-check'],
    ['error', 'lucide-circle-x'],
    ['warning', 'lucide-triangle-alert'],
    ['info', 'lucide-info'],
  ] as const)(
    'renders a lucide icon for %s toasts',
    async (type, iconClass) => {
      render(<Toaster />);

      act(() => {
        toast[type](`${type} message`);
      });

      const message = await screen.findByText(`${type} message`);
      const toastElement = message.closest('[data-sonner-toast]');
      await waitFor(() => {
        expect(toastElement?.querySelector(`svg.${iconClass}`)).not.toBeNull();
      });
    }
  );

  it('spins a lucide loader for loading toasts', async () => {
    render(<Toaster />);

    act(() => {
      toast.loading('Archiving tasks');
    });

    const message = await screen.findByText('Archiving tasks');
    const icon = message
      .closest('[data-sonner-toast]')
      ?.querySelector('svg.lucide-loader-circle');
    expect(icon).not.toBeNull();
    expect(icon).toHaveClass('animate-spin');
  });
});
