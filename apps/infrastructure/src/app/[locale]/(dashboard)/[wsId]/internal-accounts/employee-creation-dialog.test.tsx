import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render as renderView,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../../messages/en.json';
import viMessages from '../../../../../../messages/vi.json';

const api = vi.hoisted(() => ({
  create: vi.fn(),
  availability: vi.fn(),
  observe: vi.fn(),
  inspectRejection: vi.fn(),
  adjudicateRejection: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/infrastructure', async (original) => ({
  ...(await original<typeof import('@tuturuuu/internal-api/infrastructure')>()),
  createInternalEmployee: api.create,
  getEmployeeCreationAvailability: api.availability,
  getInternalEmployeeCreationOperation: api.observe,
  inspectEmployeeRejection: api.inspectRejection,
  adjudicateEmployeeRejection: api.adjudicateRejection,
}));
function TranslationContext({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {children}
    </NextIntlClientProvider>
  );
}
function render(ui: ReactElement) {
  return renderView(ui, { wrapper: TranslationContext });
}

const language = vi.hoisted(() => ({ real: false }));
vi.mock('next-intl', async (original) => {
  const actual = await original<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace: string) => {
      const translate = actual.useTranslations(namespace);
      return language.real ? translate : (key: string) => key;
    },
  };
});

const scope = vi.hoisted(() => ({
  actorId: '10000000-0000-4000-8000-000000000001',
  lifetime: { active: true },
  assertActive: vi.fn(),
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => scope,
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ wsId: '00000000-0000-0000-0000-000000000000' }),
}));

import { InternalApiError } from '@tuturuuu/internal-api/client';
import { EmployeeCreationNotAdmittedError } from '@tuturuuu/internal-api/infrastructure';
import { EmployeeCreationDialog } from './employee-creation-dialog';

beforeEach(() => {
  language.real = false;
  vi.clearAllMocks();
  sessionStorage.clear();
  scope.assertActive.mockImplementation(() => undefined);
  api.observe.mockImplementation(async (value) => ({
    status: 'stopped',
    operationId: value.operationId,
    code: 'employee_operation_halted',
  }));
  api.availability.mockResolvedValue({ available: true });
});
async function mount() {
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <EmployeeCreationDialog onDirectoryRefresh={refresh} />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'open' }));
  await waitFor(() => expect(api.availability).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('email'), {
    target: { value: 'staff@tuturuuu.com' },
  });
  fireEvent.change(screen.getByLabelText('name'), {
    target: { value: 'Staff' },
  });
  fireEvent.change(screen.getByLabelText('password'), {
    target: { value: 'Synthetic-Pass-123!' },
  });
  return refresh;
}
describe('employee creation form', () => {
  it('generates a valid password without dispatch or persistence', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'generate_password' }));
    const input = screen.getByLabelText<HTMLInputElement>('password');
    expect(input.value).toHaveLength(20);
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled();
    expect(api.create).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByLabelText('password')).toHaveValue('');
  });
  it('copies a password only after an explicit action through the secure clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    try {
      await mount();
      expect(writeText).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'copy_password' }));
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledExactlyOnceWith('Synthetic-Pass-123!')
      );
      vi.stubGlobal('isSecureContext', false);
      fireEvent.click(screen.getByRole('button', { name: 'copy_password' }));
      expect(await screen.findByText('copy_password_failed')).toBeVisible();
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(api.create).not.toHaveBeenCalled();
      expect(sessionStorage.length).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('gives inline password guidance and disables creation before operation admission', async () => {
    await mount();
    fireEvent.change(screen.getByLabelText('password'), {
      target: { value: 'lowercase-only-123!' },
    });
    expect(await screen.findByText('password_strength')).toBeVisible();
    expect(screen.getByLabelText('password')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    expect(api.create).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
  it('keeps creation disabled when runtime is unavailable', async () => {
    api.availability.mockResolvedValue({ available: false });
    await mount();
    await screen.findByText('unavailable');
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    expect(api.create).not.toHaveBeenCalled();
  });
  it('admits once and locks pending outcome through close/reopen without retaining password', async () => {
    let finish: (value: unknown) => void = () => {};
    api.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const refresh = await mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    fireEvent.click(screen.getByRole('button', { name: 'submitting' }));
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'close' })).toBeDisabled();
    const key = api.create.mock.calls[0]?.[1].operationId;
    expect(key).toMatch(/^[a-f0-9-]{36}$/);
    finish({
      status: 'pending',
      operationId: key,
      code: 'account_creation_outcome_unknown',
      nextAction: 'inspect',
    });
    await screen.findByText('stopped');
    expect(screen.getByLabelText('password')).toHaveValue('');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    await screen.findByText('stopped');
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    expect(api.create).toHaveBeenCalledTimes(1);
  });
  it('treats uncertain network rejection as inspection, never an automatic retry', async () => {
    api.create.mockRejectedValue(new Error('network outcome unknown'));
    await mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await screen.findByText('stopped');
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
  });
  it('automatically confirms a lost POST response with a read and no second POST', async () => {
    api.create.mockRejectedValue(new Error('response lost'));
    api.observe.mockImplementation(async (value) => ({
      status: 'created',
      operationId: value.operationId,
      account: {
        id: '10000000-0000-4000-8000-000000000003',
        email: value.email,
        displayName: value.displayName,
      },
    }));
    const refresh = await mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await screen.findByText('created');
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.observe).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0);
  });
  it('does not dispatch when storage refuses the original operation', async () => {
    const storage = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });
    await mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await screen.findByText('stopped');
    expect(api.create).not.toHaveBeenCalled();
    storage.mockRestore();
  });
  it('does not turn confirmed creation into retry when directory refresh fails', async () => {
    api.create.mockResolvedValue({ status: 'created' });
    const refresh = await mount();
    refresh.mockRejectedValue(new Error('refresh failed'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await screen.findByText('created');
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    expect(api.create).toHaveBeenCalledTimes(1);
  });
});

it('recovers precommit adjudication failure through explicit same-event retry before one same-operation CREATE', async () => {
  api.create.mockImplementationOnce(async (_payload, options) => ({
    status: 'pending',
    operationId: options.operationId,
    code: 'account_creation_outcome_unknown',
    nextAction: 'inspect',
  }));
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'submit' }));
  await screen.findByRole('button', { name: 'inspect' });
  const key = `infra:employee-create:v1:${scope.actorId}:00000000-0000-0000-0000-000000000000`;
  const saved = JSON.parse(sessionStorage.getItem(key) ?? '{}');
  const candidate = {
    status: 'eligible',
    actorUserId: scope.actorId,
    operationId: saved.operationId,
    targetUserId: '10000000-0000-4000-8000-000000000003',
    email: 'staff@tuturuuu.com',
    displayName: 'Staff',
    originalLeaseId: '10000000-0000-4000-8000-000000000004',
    originalAttemptEventId: '10000000-0000-4000-8000-000000000005',
    expectedVersion: 2,
  };
  api.inspectRejection.mockResolvedValue(candidate);
  api.adjudicateRejection.mockRejectedValueOnce(
    new Error('precommit unavailable')
  );
  api.adjudicateRejection.mockImplementation(async (body) => ({
    ...candidate,
    status: 'retry_ready',
    expectedVersion: 3,
    eventId: body.adjudication.eventId,
    evidenceReferenceSha256: body.adjudication.evidenceReferenceSha256,
  }));
  fireEvent.click(screen.getByRole('button', { name: 'inspect' }));
  await screen.findByLabelText('evidence');
  fireEvent.change(screen.getByLabelText('evidence'), {
    target: { value: 'a'.repeat(64) },
  });
  expect(screen.getByRole('button', { name: 'adjudicate' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'attestation' }));
  fireEvent.click(screen.getByRole('button', { name: 'adjudicate' }));
  await screen.findByText('unconfirmed');
  expect(screen.queryByLabelText('evidence')).not.toBeInTheDocument();
  expect(api.adjudicateRejection).toHaveBeenCalledTimes(1);
  expect(screen.getByText('fenced')).toBeInTheDocument();
  api.inspectRejection.mockResolvedValueOnce({
    status: 'fenced',
    operationId: saved.operationId,
  });
  fireEvent.click(screen.getByRole('button', { name: 'inspect' }));
  await waitFor(() => expect(api.inspectRejection).toHaveBeenCalledTimes(3));
  expect(screen.getByText('fenced')).toBeInTheDocument();
  expect(screen.queryByLabelText('evidence')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'inspect' }));
  await screen.findByLabelText('evidence');
  expect(screen.queryByText('fenced')).not.toBeInTheDocument();
  expect(screen.getByLabelText('evidence')).toHaveValue('a'.repeat(64));
  expect(screen.getByLabelText('evidence')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'adjudicate' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'attestation' }));
  fireEvent.click(screen.getByRole('button', { name: 'adjudicate' }));
  await waitFor(() => expect(screen.getByLabelText('password')).toBeEnabled());
  expect(api.adjudicateRejection.mock.calls[1]?.[0]).toEqual(
    api.adjudicateRejection.mock.calls[0]?.[0]
  );
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('email')).toBeDisabled();
  expect(screen.getByLabelText('name')).toBeDisabled();
  expect(screen.getByLabelText('password')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('password'), {
    target: { value: 'Fresh-Password-456!' },
  });
  api.create.mockImplementationOnce(async (payload, options) => ({
    status: 'created',
    operationId: options.operationId,
    account: {
      id: candidate.targetUserId,
      email: payload.email,
      displayName: payload.displayName,
    },
  }));
  fireEvent.click(screen.getByRole('button', { name: 'submit' }));
  await screen.findByText('created');
  expect(api.create.mock.calls[1]?.[1].operationId).toBe(saved.operationId);
  expect(api.create.mock.calls[1]?.[0].temporaryPassword).toBe(
    'Fresh-Password-456!'
  );
  expect(sessionStorage.getItem(key)).toBeNull();
});

describe('CREATE recovery presentation', () => {
  const key = `infra:employee-create:v1:${scope.actorId}:00000000-0000-0000-0000-000000000000`;
  const submit = () => {
    const form = screen.getByLabelText('password').closest('form');
    if (!form) throw new Error('Missing CREATE form');
    fireEvent.submit(form);
  };
  it('distinguishes a failed readiness read and retries GET without admitting a request', async () => {
    api.availability.mockRejectedValueOnce(
      new Error('private readiness detail')
    );
    await mount();
    expect(
      await screen.findByText('problems.readiness_read_failed')
    ).toBeVisible();
    expect(screen.queryByText('unavailable')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    api.availability.mockResolvedValue({ available: false });
    fireEvent.click(screen.getByRole('button', { name: 'retry_readiness' }));
    expect(await screen.findByText('unavailable')).toBeVisible();
    submit();
    expect(api.create).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    api.availability.mockResolvedValue({ available: true });
    fireEvent.click(screen.getByRole('button', { name: 'retry_readiness' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    expect(api.availability).toHaveBeenCalledTimes(3);
    expect(api.create).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
  it('does not trust a cached available result after a failed fresh readiness read', async () => {
    await mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    api.availability.mockRejectedValueOnce(new Error('Fresh read unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    await screen.findByText('problems.readiness_read_failed');
    fireEvent.change(screen.getByLabelText('email'), {
      target: { value: 'staff@tuturuuu.com' },
    });
    fireEvent.change(screen.getByLabelText('name'), {
      target: { value: 'Staff' },
    });
    fireEvent.change(screen.getByLabelText('password'), {
      target: { value: 'Synthetic-Pass-123!' },
    });
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    submit();
    expect(api.create).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
  it.each([
    'UPPERCASEONLY123!',
    'lowercaseonly123!',
    'NoDigitsHere!!',
    'NoSymbolHere123',
    'Aa1!',
    `Aa1!${'a'.repeat(69)}`,
    'UnicodePunctuation123—',
  ])(
    'rejects malformed password %s even through direct form submission',
    async (password) => {
      await mount();
      fireEvent.change(screen.getByLabelText('password'), {
        target: { value: password },
      });
      submit();
      expect(await screen.findByText('problems.invalid_input')).toBeVisible();
      expect(api.create).not.toHaveBeenCalled();
      expect(sessionStorage.length).toBe(0);
    }
  );
  it('separates storage refusal from authorization without dispatch', async () => {
    await mount();
    const storage = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('private storage detail');
      });
    try {
      submit();
      expect(await screen.findByText('problems.storage')).toBeVisible();
      expect(screen.queryByText('denied')).not.toBeInTheDocument();
      expect(api.create).not.toHaveBeenCalled();
    } finally {
      storage.mockRestore();
    }
  });
  it.each(['invalid_input', 'unavailable'] as const)(
    'retains bound non-admission for %s without claiming absence or replay',
    async (reason) => {
      api.create.mockImplementation(async (input, options) => {
        throw new EmployeeCreationNotAdmittedError({
          status: 'not_admitted',
          code: 'employee_creation_not_admitted',
          reason,
          phase: 'before_claim',
          targetUserId: null,
          actorUserId: scope.actorId,
          operationId: options.operationId,
          email: input.email,
          displayName: input.displayName,
        });
      });
      await mount();
      submit();
      expect(await screen.findByText('problems.not_admitted')).toBeVisible();
      await screen.findByText('stopped');
      const saved = JSON.parse(sessionStorage.getItem(key) ?? '{}');
      expect(api.create.mock.calls[0]?.[1]).toEqual({
        operationId: saved.operationId,
        actorUserId: scope.actorId,
      });
      expect(saved).toMatchObject({
        actorId: scope.actorId,
        email: 'staff@tuturuuu.com',
        displayName: 'Staff',
      });
      expect(saved.operationId).toMatch(/^[a-f0-9-]{36}$/);
      expect(screen.getByLabelText('password')).toHaveValue('');
      fireEvent.click(screen.getByRole('button', { name: 'close' }));
      fireEvent.click(screen.getByRole('button', { name: 'open' }));
      expect(screen.getByLabelText('email')).toHaveValue(saved.email);
      submit();
      expect(api.create).toHaveBeenCalledTimes(1);
      expect(JSON.parse(sessionStorage.getItem(key) ?? '{}').operationId).toBe(
        saved.operationId
      );
    }
  );
  it.each([400, 401, 403, 503])(
    'retains intent after generic HTTP %s without trusting the code or raw message',
    async (status) => {
      api.create.mockRejectedValue(
        new InternalApiError(
          'PRIVATE provider message',
          status,
          'employee_creation_unavailable'
        )
      );
      await mount();
      submit();
      expect(
        await screen.findByText(
          status === 401 || status === 403
            ? 'problems.authorization'
            : 'problems.unknown'
        )
      ).toBeVisible();
      await screen.findByText('stopped');
      expect(
        screen.queryByText('PRIVATE provider message')
      ).not.toBeInTheDocument();
      const saved = sessionStorage.getItem(key);
      expect(saved).not.toBeNull();
      expect(saved).not.toContain('Synthetic-Pass-123!');
      submit();
      expect(api.create).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(key)).toBe(saved);
    }
  );
  it('keeps ordinary confirmed success to one POST with no sequential observation', async () => {
    api.create.mockResolvedValue({ status: 'created' });
    await mount();
    submit();
    await screen.findByText('created');
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.observe).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
});

it.each(['en', 'vi'] as const)(
  'renders saved-request uncertainty and manual-password guidance in %s',
  async (locale) => {
    language.real = true;
    const labels = (locale === 'en' ? en : viMessages)['internal-accounts'];
    api.create.mockRejectedValue(new Error('PRIVATE response loss'));
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <NextIntlClientProvider
          locale={locale}
          messages={locale === 'en' ? en : viMessages}
        >
          <EmployeeCreationDialog
            onDirectoryRefresh={vi.fn().mockResolvedValue(undefined)}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: labels.creation.open }));
    await waitFor(() => expect(api.availability).toHaveBeenCalled());
    const entropy = vi
      .spyOn(crypto, 'getRandomValues')
      .mockImplementation(() => {
        throw new Error('Entropy unavailable');
      });
    try {
      fireEvent.click(
        screen.getByRole('button', { name: labels.dialog.generate_password })
      );
      expect(
        screen.getByText(labels.dialog.generate_password_failed)
      ).toBeVisible();
      expect(screen.getByLabelText(labels.creation.password)).toHaveValue('');
      expect(api.create).not.toHaveBeenCalled();
      expect(sessionStorage.length).toBe(0);
    } finally {
      entropy.mockRestore();
    }
    fireEvent.change(screen.getByLabelText(labels.creation.email), {
      target: { value: 'staff@tuturuuu.com' },
    });
    fireEvent.change(screen.getByLabelText(labels.creation.name), {
      target: { value: 'Staff' },
    });
    fireEvent.change(screen.getByLabelText(labels.creation.password), {
      target: { value: 'Manual-Password-123!' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: labels.creation.submit })
    );
    const uncertainty =
      locale === 'en'
        ? 'We couldn’t confirm the result. Your original request is saved. Do not create another request.'
        : 'Chưa thể xác nhận kết quả. Yêu cầu ban đầu của bạn đã được lưu. Không tạo yêu cầu khác.';
    expect(await screen.findByText(uncertainty)).toBeVisible();
    expect(screen.queryByText('PRIVATE response loss')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: labels.creation.submit })
    ).toBeDisabled();
    expect(api.create).toHaveBeenCalledTimes(1);
  }
);
