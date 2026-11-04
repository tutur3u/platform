import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Form from './form';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/meet',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('./create-plan-dialog', () => ({
  default: () => <button type="button">create-plan-dialog</button>,
}));
vi.mock('./date-selector', () => ({ default: () => null }));
vi.mock('./time-selector', () => ({ TimeSelector: () => null }));
vi.mock('./timezone-selector', () => ({ default: () => null }));

describe('Meet plan form', () => {
  it('replaces plan creation with a sign-in prompt when signed out', () => {
    render(<Form user={null} planBasePath="/meet/plans" />);

    expect(screen.queryByText('create-plan-dialog')).toBeNull();
    const prompt = screen.getByTestId('create-plan-sign-in-prompt');
    expect(prompt).toHaveTextContent('sign_in_to_create_plan_desc');
    expect(
      screen.getByRole('link', { name: 'sign_in_to_create_plan' })
    ).toHaveAttribute('href', '/login?next=%2Fmeet');
  });

  it('treats a user without an id as signed out', () => {
    render(<Form user={{}} planBasePath="/meet/plans" />);

    expect(screen.queryByText('create-plan-dialog')).toBeNull();
    expect(screen.getByTestId('create-plan-sign-in-prompt')).toBeTruthy();
  });

  it('shows the create-plan dialog for a signed-in user', () => {
    render(<Form user={{ id: 'user-1' }} planBasePath="/meet/plans" />);

    expect(screen.getByText('create-plan-dialog')).toBeTruthy();
    expect(screen.queryByTestId('create-plan-sign-in-prompt')).toBeNull();
  });
});
