/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactLabelsSettings } from './contact-labels-settings';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateConfig: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  getOptionalWorkspaceConfig: mocks.getConfig,
  updateWorkspaceConfig: mocks.updateConfig,
}));

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ContactLabelsSettings wsId="ws_1" />
    </QueryClientProvider>
  );
  return client;
}

const archivedField = async () =>
  (await screen.findByLabelText(
    'contact-labels-settings.archived'
  )) as HTMLInputElement;

const button = (name: string) =>
  screen.getByRole('button', {
    name: `contact-labels-settings.${name}`,
  }) as HTMLButtonElement;

describe('ContactLabelsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateConfig.mockResolvedValue({ message: 'ok' });
  });

  it('shows defaults as placeholders and saves only trimmed overrides', async () => {
    mocks.getConfig.mockResolvedValue({
      value: JSON.stringify({ archived: 'Inactive', unknown: 'x' }),
    });
    renderPanel();

    expect((await archivedField()).value).toBe('Inactive');
    const temporary = screen.getByLabelText(
      'contact-labels-settings.archived_until'
    ) as HTMLInputElement;
    expect(temporary.value).toBe('');
    expect(temporary.placeholder).toBe('ws-users.status_archived_until');

    const save = button('save');
    expect(save.disabled).toBe(true);

    fireEvent.change(temporary, { target: { value: '  On break  ' } });
    fireEvent.click(save);

    await waitFor(() =>
      expect(mocks.updateConfig).toHaveBeenCalledWith(
        'ws_1',
        'user_status_labels',
        JSON.stringify({ archived: 'Inactive', archived_until: 'On break' })
      )
    );
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
  });

  it('resets every label to its default', async () => {
    mocks.getConfig.mockResolvedValue({
      value: JSON.stringify({ archived: 'Inactive' }),
    });
    renderPanel();

    expect((await archivedField()).value).toBe('Inactive');
    fireEvent.click(button('reset'));
    expect((await archivedField()).value).toBe('');
    fireEvent.click(button('save'));

    await waitFor(() =>
      expect(mocks.updateConfig).toHaveBeenCalledWith(
        'ws_1',
        'user_status_labels',
        '{}'
      )
    );
  });

  it('treats a missing config as all defaults', async () => {
    mocks.getConfig.mockResolvedValue(null);
    renderPanel();

    expect((await archivedField()).value).toBe('');
    expect(button('reset').disabled).toBe(true);
  });

  it('shows a retryable error when the labels cannot load', async () => {
    mocks.getConfig.mockRejectedValueOnce(new Error('boom'));
    renderPanel();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'contact-labels-settings.load_error'
    );
    mocks.getConfig.mockResolvedValue(null);
    fireEvent.click(button('retry'));
    expect((await archivedField()).value).toBe('');
  });

  it('reports a failed save', async () => {
    mocks.getConfig.mockResolvedValue(null);
    mocks.updateConfig.mockRejectedValueOnce(new Error('forbidden'));
    renderPanel();

    fireEvent.change(await archivedField(), { target: { value: 'Inactive' } });
    fireEvent.click(button('save'));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
  });
});
