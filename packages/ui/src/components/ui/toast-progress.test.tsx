import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from './sonner';
import { ToastProgress } from './toast-progress';

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

describe('ToastProgress', () => {
  afterEach(() => {
    act(() => {
      toast.dismiss();
    });
  });

  it('shows the label, x/N and an accessible bar', () => {
    render(<ToastProgress done={20} label="Deleting tasks" total={80} />);

    expect(screen.getByText('Deleting tasks')).toBeInTheDocument();
    expect(screen.getByText('20/80')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Deleting tasks' });
    expect(bar).toHaveAttribute('aria-valuenow', '20');
    expect(bar).toHaveAttribute('aria-valuemax', '80');
    // Assistive tech reads value/max itself; a raw "20/80" would read as a date.
    expect(bar).not.toHaveAttribute('aria-valuetext');
    expect(bar.querySelector('[data-slot="progress-indicator"]')).toHaveStyle({
      transform: 'translateX(-75%)',
    });
  });

  it('clamps out-of-range counts', () => {
    render(<ToastProgress done={12} label="Restoring tasks" total={10} />);
    expect(screen.getByText('10/10')).toBeInTheDocument();

    render(<ToastProgress done={-3} label="Moving tasks" total={0} />);
    expect(screen.getByText('0/0')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Moving tasks' })
    ).toHaveAttribute('aria-valuenow', '0');
  });

  it('updates in place and keeps the Undo action beside the message', async () => {
    render(<Toaster />);

    act(() => {
      toast.loading(
        <ToastProgress done={0} label="Deleting tasks" total={2} />,
        { id: 'bulk' }
      );
    });
    expect(await screen.findByText('0/2')).toBeInTheDocument();

    act(() => {
      toast.success('Deleted selected tasks', {
        id: 'bulk',
        action: { label: 'Undo', onClick: () => undefined },
      });
    });

    const message = await screen.findByText('Deleted selected tasks');
    const toastElement = message.closest('[data-sonner-toast]');
    expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(1);
    expect(toastElement?.querySelector('[data-action]')).toHaveTextContent(
      'Undo'
    );
    expect(screen.queryByText('0/2')).not.toBeInTheDocument();
  });
});
