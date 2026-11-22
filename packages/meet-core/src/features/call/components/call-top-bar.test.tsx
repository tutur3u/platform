// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { CallTopBarConnection } from './call-top-bar';

afterEach(cleanup);

it('renders nothing while the connection is open', () => {
  const { container } = render(
    <CallTopBarConnection status="open" onRetry={vi.fn()} />
  );
  expect(container.firstChild).toBeNull();
});

it.each(['reconnecting', 'connecting'] as const)(
  'shows only a quiet labelled indicator while %s',
  (status) => {
    render(<CallTopBarConnection status={status} onRetry={vi.fn()} />);
    expect(screen.getByRole('status', { name: 'reconnecting' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('reconnecting')).toBeNull();
    expect(screen.queryByText('connection_refresh')).toBeNull();
  }
);

it.each(['error', 'closed'] as const)(
  'offers one refresh action once recovery stops (%s)',
  (status) => {
    const onRetry = vi.fn();
    render(<CallTopBarConnection status={status} onRetry={onRetry} />);
    expect(screen.queryByRole('status')).toBeNull();
    // getByRole throws when more than one button renders.
    const refresh = screen.getByRole('button', { name: /connection_refresh/ });
    fireEvent.click(refresh);
    expect(onRetry).toHaveBeenCalledOnce();
  }
);
