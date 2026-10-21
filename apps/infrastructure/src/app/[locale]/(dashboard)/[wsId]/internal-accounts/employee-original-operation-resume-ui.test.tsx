import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EmployeeCreationRecovery } from './employee-creation-recovery';
import { EmployeeOriginalOperationResume } from './employee-original-operation-resume';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
it('loads the server identity explicitly with one GET and publishes ready state without CREATE', async () => {
  sessionStorage.clear();
  const actorId = '10000000-0000-4000-8000-000000000001';
  const operationId = '10000000-0000-4000-8000-000000000002';
  const inspectRejection = vi.fn().mockResolvedValue({
    status: 'eligible',
    expectedVersion: 2,
    actorUserId: actorId,
    operationId,
    targetUserId: '10000000-0000-4000-8000-000000000003',
    originalLeaseId: '10000000-0000-4000-8000-000000000004',
    originalAttemptEventId: '10000000-0000-4000-8000-000000000005',
    email: 'hehe@tuturuuu.com',
    displayName: 'Hehe',
  });
  const adjudicateRejection = vi.fn();
  const onResume = vi.fn();
  const onBusyChange = vi.fn();
  const recovery = new EmployeeCreationRecovery({
    actorId,
    workspaceId: '00000000-0000-0000-0000-000000000000',
    storage: sessionStorage,
    assertActive() {},
    inspectRejection,
    adjudicateRejection,
  });
  recovery.activate();
  render(
    <EmployeeOriginalOperationResume
      recovery={recovery}
      onResume={onResume}
      onBusyChange={onBusyChange}
    />
  );
  expect(inspectRejection).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: operationId },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'load' }));
  });
  expect(inspectRejection).toHaveBeenCalledExactlyOnceWith(operationId);
  expect(adjudicateRejection).not.toHaveBeenCalled();
  expect(onResume).toHaveBeenCalledWith(
    expect.objectContaining({
      operationId,
      email: 'hehe@tuturuuu.com',
      state: 'stopped',
    })
  );
  expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
});
