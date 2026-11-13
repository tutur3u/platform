import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './app-error-boundary';

describe('AppErrorBoundary', () => {
  it('renders the shared status page with recovery actions and a safe reference', () => {
    const reset = vi.fn();
    const error = Object.assign(new Error('sensitive provider response'), {
      digest: 'safe-reference',
    });

    const { container } = render(
      <AppErrorBoundary appName="Calendar" error={error} reset={reset} />
    );

    expect(
      container.querySelector('[data-status-page="error"]')
    ).not.toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Something went wrong' })
    ).toBeInTheDocument();
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
      screen.getByRole('heading', { name: 'Đã có lỗi xảy ra' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('adds the Tuturuuu header and footer for app-level boundaries', () => {
    const { container } = render(
      <AppErrorBoundary
        chrome="page"
        error={new Error('hidden')}
        reset={vi.fn()}
      />
    );
    expect(container.querySelector('header')).not.toBeNull();
    expect(container.querySelector('footer')).not.toBeNull();
  });

  it('shows no app breadcrumb or app link for the platform itself', () => {
    render(
      <AppErrorBoundary
        appName="Tuturuuu"
        chrome="page"
        error={new Error('hidden')}
        reset={vi.fn()}
      />
    );
    expect(screen.queryByRole('link', { name: 'Open Tuturuuu' })).toBeNull();
    expect(
      screen.getAllByRole('link', { name: 'Tuturuuu home' }).length
    ).toBeGreaterThan(0);
  });
});
