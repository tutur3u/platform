import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccountAssuranceRefresh } from './account-assurance-refresh';

const getProfile = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserProfile: getProfile,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/personal' }));
beforeEach(() => {
  getProfile.mockReset();
  focusManager.setFocused(true);
});
afterEach(() => focusManager.setFocused(undefined));
function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AccountAssuranceRefresh />
      <p>cached workspace</p>
    </QueryClientProvider>
  );
}
it('keeps cached content visible and revalidates on focus', async () => {
  getProfile.mockResolvedValue({ id: 'actor' });
  mount();
  expect(screen.getByText('cached workspace')).toBeTruthy();
  await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(1));
  focusManager.setFocused(false);
  focusManager.setFocused(true);
  await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(2));
});
it('does not block optional cached content when offline', async () => {
  getProfile.mockRejectedValue(new Error('Offline'));
  mount();
  await waitFor(() => expect(getProfile).toHaveBeenCalledOnce());
  expect(screen.getByText('cached workspace')).toBeTruthy();
});
