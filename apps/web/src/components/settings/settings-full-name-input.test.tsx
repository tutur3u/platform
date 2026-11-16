// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FullNameInput from './settings-full-name-input';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('@tuturuuu/ui/hooks/use-toast', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/use-current-user-profile', () => ({
  currentUserProfileQueryKey: ['user', 'me'],
}));

beforeEach(() => {
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function setup(props: Parameters<typeof FullNameInput>[0] = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FullNameInput {...props} />
    </QueryClientProvider>
  );
  return {
    input: screen.getByRole('textbox') as HTMLInputElement,
    save: screen.getByRole('button', { name: 'save' }),
  };
}

it('always renders the save button, disabled until the name changes', () => {
  const { input, save } = setup({ defaultValue: 'Võ Hoàng Phúc' });
  expect(save).toBeInTheDocument();
  expect(save).toBeDisabled();

  fireEvent.change(input, { target: { value: 'Võ Phúc' } });
  expect(save).toBeEnabled();

  fireEvent.change(input, { target: { value: '  Võ Hoàng Phúc ' } });
  expect(save).toBeDisabled();

  fireEvent.change(input, { target: { value: '   ' } });
  expect(save).toBeDisabled();
});

it('renders the save button when no full name is set yet', () => {
  const { save } = setup({ defaultValue: null });
  expect(save).toBeDisabled();
});

it('uses the provided placeholder', () => {
  const { input } = setup({ placeholder: 'phucvo@tuturuuu.com' });
  expect(input).toHaveAttribute('placeholder', 'phucvo@tuturuuu.com');
});

it('saves once on Enter, shows a success toast and disables again', async () => {
  mocks.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
  const { input, save } = setup({ defaultValue: '' });

  fireEvent.change(input, { target: { value: '  Võ Hoàng Phúc  ' } });
  fireEvent.submit(input.closest('form') as HTMLFormElement);

  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  const [url, init] = mocks.fetch.mock.calls[0]!;
  expect(url).toBe('/api/v1/users/me/full-name');
  expect(init.method).toBe('PATCH');
  expect(JSON.parse(init.body)).toEqual({ full_name: 'Võ Hoàng Phúc' });

  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'profile-updated',
      description: 'full-name-updated',
    })
  );
  expect(mocks.refresh).toHaveBeenCalledOnce();
  await waitFor(() => expect(save).toBeDisabled());
});

it('clicking save submits exactly once', async () => {
  mocks.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
  const { input, save } = setup({ defaultValue: 'Old' });

  fireEvent.change(input, { target: { value: 'New' } });
  fireEvent.click(save);

  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it('shows an error toast and keeps the edit when saving fails', async () => {
  mocks.fetch.mockResolvedValue(
    new Response(JSON.stringify({ message: 'Too long' }), { status: 400 })
  );
  const { input, save } = setup({ defaultValue: 'Old' });

  fireEvent.change(input, { target: { value: 'New' } });
  fireEvent.click(save);

  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'error-occurred',
      description: 'Too long',
    })
  );
  expect(input.value).toBe('New');
  expect(save).toBeEnabled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
