import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './app-error-boundary';

describe('AppErrorBoundary', () => {
  it('offers recovery actions and renders a safe error reference', () => {
    const reset = vi.fn();
    const error = Object.assign(new Error('sensitive provider response'), {
      digest: 'safe-reference',
    });

    render(<AppErrorBoundary appName="Calendar" error={error} reset={reset} />);

    expect(screen.getByText('This view could not load')).toBeInTheDocument();
    expect(screen.getByText('safe-reference')).toBeInTheDocument();
    expect(
      screen.queryByText('sensitive provider response')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('supports the Vietnamese recovery experience', () => {
    render(
      <AppErrorBoundary
        error={new Error('hidden')}
        locale="vi"
        reset={vi.fn()}
      />
    );

    expect(
      screen.getByRole('heading', {
        name: 'Không thể tải giao diện này',
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});
