import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const linkProps = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('next/link', () => ({
  default: ({
    children,
    ...props
  }: { children: React.ReactNode } & Record<string, unknown>) => {
    linkProps.push(props);
    return <a href={String(props.href)}>{children}</a>;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';

describe('GetStartedButton', () => {
  it('links to its target without prefetching it', () => {
    render(<GetStartedButton text="Get started" href="/login" />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/login');
    expect(linkProps.at(-1)).toMatchObject({ href: '/login', prefetch: false });
  });
});
