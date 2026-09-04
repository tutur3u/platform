import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileFieldForm } from './profile-field-form';

const routerRefresh = vi.fn();
const updateCurrentUserProfile = vi.fn();

vi.mock('@tuturuuu/internal-api', () => ({
  updateCurrentUserEmail: vi.fn(),
  updateCurrentUserFullName: vi.fn(),
  updateCurrentUserProfile: (...args: unknown[]) =>
    updateCurrentUserProfile(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: routerRefresh,
  }),
}));

function renderWithClient(ui: ReactNode, queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProfileFieldForm', () => {
  it('refreshes the app shell after updating the display name', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    updateCurrentUserProfile.mockResolvedValue({
      message: 'Profile updated successfully',
    });

    renderWithClient(
      <ProfileFieldForm field="display_name" initialValue="Old Name" />,
      queryClient
    );

    const input = screen.getByLabelText('display-name');
    fireEvent.change(input, { target: { value: '  New Name  ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() =>
      expect(updateCurrentUserProfile).toHaveBeenCalledWith({
        display_name: 'New Name',
      })
    );
    await waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
  });
});
