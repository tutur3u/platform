import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  createInternalEmployee,
  createJournaledInternalEmployee,
} from '@tuturuuu/internal-api/infrastructure';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSatelliteQueryClient } from '../../../../../../../../packages/satellite/src/providers/query-client';
import { EmployeeCreationDialog } from './employee-creation-dialog';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

afterEach(() => vi.unstubAllGlobals());

const endpoint = '/api/v1/infrastructure/internal-accounts/employees';

describe('employee creation through the public client barrel', () => {
  it('binds both public creation names to the journaled implementation', () => {
    expect(createInternalEmployee).toBe(createJournaledInternalEmployee);
  });

  it('checks readiness on open and sends one journaled POST with its operation key', async () => {
    const transport = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe(endpoint);
      if (init?.method !== 'POST') return Response.json({ available: true });
      const operationId = new Headers(init.headers).get('Idempotency-Key');
      return Response.json({
        status: 'pending',
        operationId,
        code: 'account_creation_outcome_unknown',
        nextAction: 'inspect',
      });
    });
    vi.stubGlobal('fetch', transport);
    const client = createSatelliteQueryClient();
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(
      <QueryClientProvider client={client}>
        <EmployeeCreationDialog onDirectoryRefresh={refresh} />
      </QueryClientProvider>
    );
    expect(transport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    expect(transport.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
    fireEvent.change(screen.getByLabelText('email'), {
      target: { value: 'fixture@tuturuuu.com' },
    });
    fireEvent.change(screen.getByLabelText('name'), {
      target: { value: 'Fixture' },
    });
    fireEvent.change(screen.getByLabelText('password'), {
      target: { value: 'fixture-only-password' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await screen.findByText('inspect');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(transport).toHaveBeenCalledTimes(2);
    const init = transport.mock.calls[1]?.[1];
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store' });
    const headers = new Headers(init?.headers);
    expect(headers.get('Idempotency-Key')).toMatch(/^[a-f0-9-]{36}$/);
    expect(headers.get('x-tuturuuu-account-action')).toBe('1');
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'fixture@tuturuuu.com',
      displayName: 'Fixture',
      temporaryPassword: 'fixture-only-password',
    });
    expect(screen.getByLabelText('password')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    await screen.findByText('inspect');
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(3));
    expect(transport.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
    expect(transport.mock.calls[2]?.[1]?.method ?? 'GET').toBe('GET');
    expect(screen.getByLabelText('password')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    expect(
      transport.mock.calls.filter(([, init]) => init?.method === 'POST')
    ).toHaveLength(1);
    client.clear();
  });
});
