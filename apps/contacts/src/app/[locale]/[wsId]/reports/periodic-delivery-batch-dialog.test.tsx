import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type {
  PeriodicReport,
  PeriodicReportDeliveryBatchControls,
  PeriodicReportDeliveryBatchResult,
} from '@tuturuuu/internal-api/reports';
import {
  useWorkspaceActor,
  WorkspaceVisibilityProvider,
} from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import en from '../../../../../messages/en.json';
import {
  type PeriodicBatchIntent,
  PeriodicDeliveryBatchDialog,
} from './periodic-delivery-batch-dialog';

const batch = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api/reports')>()),
  requestPeriodicReportDeliveryBatch: batch,
}));
beforeEach(() => {
  batch.mockReset();
});
const reports = [
  {
    id: 'synthetic-report',
    user_id: 'synthetic-user',
    title: 'Monthly report',
    user_name: 'Synthetic recipient',
    user_email: 'recipient@example.com',
    report_approval_status: 'APPROVED',
    generation_status: 'ready',
    delivery_status: 'draft',
    report_stage: 'approved',
    last_delivery_error: null,
  },
] as PeriodicReport[];
const complete: PeriodicReportDeliveryBatchResult = {
  items: [{ reportId: reports[0]!.id, queued: true, outcome: 'queued' }],
  stopped: false,
  stopReason: 'complete',
  remainingReportIds: [],
};
function show() {
  const client = new QueryClient();
  let intent: PeriodicBatchIntent | null = null;
  const close = vi.fn();
  const queued = vi.fn();
  function Scoped({
    epoch,
    canSend,
    current,
  }: {
    epoch: number;
    canSend: boolean;
    current: PeriodicReport[];
  }) {
    const actor = useWorkspaceActor();
    if (!intent && actor)
      intent = { actor, wsId: 'workspace-a', epoch: 0, reports };
    return (
      <PeriodicDeliveryBatchDialog
        intent={intent}
        reports={current}
        wsId="workspace-a"
        epoch={epoch}
        canSend={canSend}
        onClose={close}
        onQueued={queued}
      />
    );
  }
  const view = (
    epoch = 0,
    canSend = true,
    current = reports,
    actorId = 'actor-a'
  ) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId={actorId}>
        <NextIntlClientProvider locale="en" messages={en}>
          <Scoped epoch={epoch} canSend={canSend} current={current} />
        </NextIntlClientProvider>
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  return { ...render(view()), view, close, queued };
}
it('reviews named recipients and reports queue acceptance separately from sent', async () => {
  batch.mockResolvedValue(complete);
  const result = show();
  expect(screen.getByRole('dialog')).toHaveTextContent('recipient@example.com');
  expect(screen.getByRole('dialog')).toHaveTextContent('not delivered');
  fireEvent.click(
    screen.getByRole('button', { name: 'Queue reviewed reports' })
  );
  await waitFor(() => expect(result.queued).toHaveBeenCalledOnce());
  expect(batch).toHaveBeenCalledOnce();
  expect(screen.getByRole('status')).toHaveTextContent('1');
  fireEvent.click(
    screen.getByRole('button', { name: 'Queue reviewed reports' })
  );
  expect(batch).toHaveBeenCalledOnce();
});
it('rejects recipient changes before sending', () => {
  const result = show();
  result.rerender(
    result.view(0, true, [{ ...reports[0]!, user_email: 'other@example.com' }])
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Queue reviewed reports' })
  );
  expect(batch).not.toHaveBeenCalled();
  expect(result.close).toHaveBeenCalledOnce();
});
it('invalidates the in-flight caller lease on permission loss without reviving it', async () => {
  let controls: PeriodicReportDeliveryBatchControls | undefined;
  let finish: ((value: PeriodicReportDeliveryBatchResult) => void) | undefined;
  batch.mockImplementation(
    (
      _ws: string,
      _ids: string[],
      next: PeriodicReportDeliveryBatchControls
    ) => {
      controls = next;
      return new Promise((resolve) => {
        finish = resolve;
      });
    }
  );
  const result = show();
  fireEvent.click(
    screen.getByRole('button', { name: 'Queue reviewed reports' })
  );
  expect(controls).toBeDefined();
  result.rerender(result.view(0, false));
  result.rerender(result.view(0, true));
  expect(() => controls!.assertActive()).toThrow();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await act(async () => finish?.(complete));
  expect(result.queued).not.toHaveBeenCalled();
});
it('hides captured recipients after a scope epoch change', () => {
  const result = show();
  result.rerender(result.view(1));
  expect(screen.queryByText('recipient@example.com')).not.toBeInTheDocument();
});

it.each(['actor', 'unmount'] as const)(
  'discards confirmed results after %s loss',
  async (loss) => {
    let finish:
      | ((value: PeriodicReportDeliveryBatchResult) => void)
      | undefined;
    batch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const result = show();
    fireEvent.click(
      screen.getByRole('button', { name: 'Queue reviewed reports' })
    );
    if (loss === 'unmount') result.unmount();
    else result.rerender(result.view(0, true, reports, 'actor-b'));
    await act(async () => finish?.(complete));
    expect(result.queued).not.toHaveBeenCalled();
  }
);
