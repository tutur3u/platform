import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Building2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceConfig } from './setup-helpers';
import { ResourceDialog } from './setup-resource-section';

const notices = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: notices }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const labels: Record<string, string> = {
      editResourceTitle: 'Edit warehouse',
      editResourceDescription: 'Update this warehouse name',
      save: 'Save',
      cancel: 'Cancel',
      saveError: 'Could not save warehouse',
      saveSuccess: 'Warehouse saved',
    };
    return labels[key] ?? key;
  },
}));

const clients: QueryClient[] = [];
const pending = new Set<() => void>();
function holdUpdate() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const finish = () => {
    pending.delete(finish);
    resolve({ id: 'warehouse-a' });
  };
  pending.add(finish);
  return {
    promise,
    resolve: finish,
    reject: (reason: Error) => {
      pending.delete(finish);
      reject(reason);
    },
  };
}
function mount(update: ResourceConfig['update']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const config: ResourceConfig = {
    key: 'warehouses',
    icon: Building2,
    title: 'Warehouse',
    rows: [{ id: 'warehouse-a', name: 'Original warehouse' }],
    create: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    update,
  };
  render(
    <QueryClientProvider client={client}>
      <ResourceDialog
        config={config}
        item={{ id: 'warehouse-a', name: 'Original warehouse' }}
        trigger={<Button type="button">Edit warehouse</Button>}
        wsId="workspace-a"
      />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit warehouse' }));
}
function nameInput() {
  return screen.getByLabelText('Warehouse') as HTMLInputElement;
}
function saveButton() {
  return screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
}
function editAndSave(name: string) {
  fireEvent.change(nameInput(), { target: { value: name } });
  fireEvent.click(saveButton());
}
afterEach(async () => {
  await act(async () => {
    for (const finish of [...pending]) finish();
  });
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  pending.clear();
  vi.clearAllMocks();
});

describe('warehouse resource edit recovery', () => {
  it('keeps a rejected edit visible and saves latest name on explicit retry', async () => {
    const first = holdUpdate();
    const second = holdUpdate();
    const update = vi
      .fn<ResourceConfig['update']>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    mount(update);
    editAndSave('North warehouse');
    await waitFor(() =>
      expect(update).toHaveBeenNthCalledWith(
        1,
        'warehouse-a',
        'North warehouse'
      )
    );
    await act(async () => first.reject(new Error('Synthetic update failure')));
    await waitFor(() =>
      expect(notices.error).toHaveBeenCalledWith('Could not save warehouse')
    );
    expect(nameInput().value).toBe('North warehouse');
    expect(
      screen.getByRole('dialog', { name: 'Edit warehouse' })
    ).not.toBeNull();
    expect(notices.success).not.toHaveBeenCalled();
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    editAndSave('North warehouse revised');
    await waitFor(() =>
      expect(update).toHaveBeenNthCalledWith(
        2,
        'warehouse-a',
        'North warehouse revised'
      )
    );
    await act(async () => second.resolve());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(notices.success).toHaveBeenCalledWith('Warehouse saved');
    expect(
      screen.getByRole('button', { name: 'Edit warehouse' }).textContent
    ).toBe('Edit warehouse');
  });
  it('holds successful edit open while pending and closes on completion', async () => {
    const saved = holdUpdate();
    const update = vi
      .fn<ResourceConfig['update']>()
      .mockReturnValueOnce(saved.promise);
    mount(update);
    editAndSave('East warehouse');
    await waitFor(() =>
      expect(update).toHaveBeenCalledExactlyOnceWith(
        'warehouse-a',
        'East warehouse'
      )
    );
    expect(nameInput().value).toBe('East warehouse');
    expect(
      screen.getByRole('dialog', { name: 'Edit warehouse' })
    ).not.toBeNull();
    await waitFor(() => expect(saveButton().disabled).toBe(true));
    expect(notices.success).not.toHaveBeenCalled();
    await act(async () => saved.resolve());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(notices.success).toHaveBeenCalledWith('Warehouse saved');
    expect(
      screen.getByRole('button', { name: 'Edit warehouse' }).textContent
    ).toBe('Edit warehouse');
  });
});
