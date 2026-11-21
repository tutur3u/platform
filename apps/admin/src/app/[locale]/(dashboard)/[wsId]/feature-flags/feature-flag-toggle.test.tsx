// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  legacyMutation: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/client', () => ({
  getInternalApiClient: () => ({ fetch: mocks.fetch }),
}));
vi.mock('./actions', () => ({
  mutateFeatureFlag: mocks.legacyMutation,
  reconcileFeatureFlag: mocks.reconcile,
}));

import { FeatureFlagToggle } from './feature-flag-toggle';

const copy = {
  conflict: 'Conflict',
  error: 'Error',
  loading: 'Loading',
  off: 'Off',
  on: 'On',
  reconcile: 'Reconcile',
  reset: 'Reset',
  unknown: 'Unknown result',
};
const command = {
  environment: 'production',
  expectedRevision: 0,
  flagKey: 'mobile_offline',
  overrideEnabled: true,
};
function applied(operationId: string) {
  return new Response(
    JSON.stringify({
      ...command,
      code: 'applied',
      matchesRequest: true,
      newOverride: true,
      newRevision: 1,
      oldOverride: null,
      oldRevision: 0,
      operationId,
      replayed: false,
      revision: 1,
      status: 'applied',
      storage: true,
    })
  );
}
function mount() {
  render(
    <FeatureFlagToggle
      copy={copy}
      declaredDefault={false}
      environment="production"
      expectedRevision={0}
      flagKey="mobile_offline"
      overrideEnabled={null}
    />
  );
  return screen.getByRole('switch');
}
function submittedId(call = 0): string {
  const request = mocks.fetch.mock.calls[call];
  if (!request) throw new Error('No mutation request was submitted');
  return JSON.parse(request[1].body).operationId;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.legacyMutation.mockResolvedValue({ status: 'unknown' });
  mocks.fetch.mockImplementation(async (_path, init) =>
    applied(JSON.parse(init.body).operationId)
  );
});

describe('feature flag dashboard mutation boundary', () => {
  it('posts browser intent through the guarded route without a mutation action', async () => {
    const toggle = mount();
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/v1/infrastructure/feature-flags',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-tuturuuu-feature-flag-action': '1',
        },
      })
    );
    expect(JSON.parse(mocks.fetch.mock.calls[0]?.[1]?.body ?? '{}')).toEqual({
      ...command,
      operationId: expect.any(String),
    });
    expect(mocks.legacyMutation).not.toHaveBeenCalled();
  });

  it('locks an unknown result and retries only manually with the original operation ID', async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'unknown' }), { status: 503 })
    );
    mocks.reconcile.mockResolvedValue({ status: 'absent' });
    const toggle = mount();
    fireEvent.click(toggle);
    await screen.findByText(copy.unknown);
    expect(toggle).toBeDisabled();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const id = submittedId();
    fireEvent.click(screen.getByRole('button', { name: copy.reconcile }));
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(mocks.reconcile).toHaveBeenCalledWith(id);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(submittedId(1)).toBe(id);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['network', 'malformed', 'wrong-operation'])(
    'keeps %s outcomes unknown without automatic retry',
    async (failure) => {
      if (failure === 'network')
        mocks.fetch.mockRejectedValueOnce(new Error('offline'));
      else if (failure === 'malformed')
        mocks.fetch.mockResolvedValueOnce(new Response('{'));
      else mocks.fetch.mockResolvedValueOnce(applied('different-operation'));
      const toggle = mount();
      fireEvent.click(toggle);
      await screen.findByText(copy.unknown);
      expect(toggle).toBeDisabled();
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      expect(mocks.legacyMutation).not.toHaveBeenCalled();
    }
  );
});
