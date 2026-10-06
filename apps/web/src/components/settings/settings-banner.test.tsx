import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { UserBanner } from './settings-banner';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  profile: { banner_url: 'https://cdn.test/old.webp' as string | null },
}));
vi.mock('@tuturuuu/internal-api', () => ({
  uploadCurrentUserBanner: mocks.upload,
  removeCurrentUserBanner: mocks.remove,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/use-current-user-profile', () => ({
  currentUserProfileQueryKey: ['user', 'me'],
  useCurrentUserProfile: () => ({ data: mocks.profile }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.banner_url = 'https://cdn.test/old.webp';
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <UserBanner userId="synthetic-actor" />
    </QueryClientProvider>
  );
  return invalidate;
}
it('displays the saved banner and refreshes only after finalize succeeds', async () => {
  mocks.upload.mockResolvedValueOnce({
    publicUrl: 'https://cdn.test/new.webp',
  });
  const invalidate = setup();
  expect(screen.getByRole('img', { name: 'banner' })).toHaveAttribute(
    'src',
    'https://cdn.test/old.webp'
  );
  const selected = new File(['synthetic'], 'banner.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('upload_banner'), {
    target: { files: [selected] },
  });
  await waitFor(() =>
    expect(mocks.success).toHaveBeenCalledWith('banner_updated')
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['user', 'me'] });
});
it('keeps the saved preview after failure and retries the same receipt', async () => {
  mocks.upload
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce({ publicUrl: 'https://cdn.test/new.webp' });
  setup();
  const selected = new File(['synthetic'], 'banner.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('upload_banner'), {
    target: { files: [selected] },
  });
  await screen.findByRole('button', { name: 'retry_banner' });
  expect(screen.getByRole('img')).toHaveAttribute(
    'src',
    'https://cdn.test/old.webp'
  );
  fireEvent.click(screen.getByRole('button', { name: 'retry_banner' }));
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
  expect(mocks.upload.mock.calls[1]?.slice(0, 2)).toEqual(
    mocks.upload.mock.calls[0]?.slice(0, 2)
  );
});
it('removes the saved banner through the managed API', async () => {
  mocks.remove.mockResolvedValueOnce({ committed: true });
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'remove_banner' }));
  await waitFor(() =>
    expect(mocks.success).toHaveBeenCalledWith('banner_removed')
  );
  expect(mocks.remove).toHaveBeenCalledTimes(1);
});

it('offers upload without a remove action for an empty profile', () => {
  mocks.profile.banner_url = null;
  setup();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'upload_banner' })).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: 'remove_banner' })
  ).not.toBeInTheDocument();
});

it.each(['resolve', 'reject'])(
  'does not publish stale upload %s callbacks after account-switch unmount',
  async (outcome) => {
    let resolve!: (value: unknown) => void;
    let reject!: (error: Error) => void;
    mocks.upload.mockReturnValueOnce(
      new Promise((done, fail) => {
        resolve = done;
        reject = fail;
      })
    );
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = render(
      <QueryClientProvider client={client}>
        <UserBanner userId="actor-a" />
      </QueryClientProvider>
    );
    fireEvent.change(screen.getByLabelText('upload_banner'), {
      target: {
        files: [new File(['synthetic'], 'banner.png', { type: 'image/png' })],
      },
    });
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const options = mocks.upload.mock.calls[0]?.[2];
    view.unmount();
    expect(options.signal.aborted).toBe(true);
    expect(options.isCurrent()).toBe(false);
    render(
      <QueryClientProvider client={client}>
        <UserBanner userId="actor-b" />
      </QueryClientProvider>
    );
    await act(async () => {
      if (outcome === 'resolve')
        resolve({ publicUrl: 'https://cdn.test/new.webp' });
      else reject(new Error('Unavailable'));
    });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  }
);
