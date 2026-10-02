import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorOperationError } from './protocol';

const fixture = vi.hoisted(() => ({
  create: vi.fn(),
  reserve: vi.fn(),
  reserveResponse: vi.fn(),
  execute: vi.fn(),
  readEvent: vi.fn(),
  deletionResult: vi.fn(),
  resolveColorChoice: vi.fn(),
  inspect: vi.fn(),
  cancel: vi.fn(),
  colorCreate: vi.fn(),
}));
vi.mock('./mutation-request-service', () => ({
  createRequestGoogleMutationService: fixture.create,
}));
vi.mock('./request-service', () => ({
  createRequestColorOperationService: fixture.colorCreate,
}));

import {
  handleGoogleColorRecovery,
  handleRecoverableGoogleDelete,
  handleRecoverableGooglePut,
  handleRecoverableGoogleResponse,
} from './route-handlers';

const operationId = '00000000-0000-4000-8000-000000009851';
const args = () => ({
  request: new Request('https://fixture.invalid/events', { method: 'PUT' }),
  rawWsId: 'workspace',
  eventId: 'event',
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED', 'true');
  fixture.create.mockResolvedValue({
    ...fixture,
    identity: { connectionId: 'owned' },
  });
  fixture.reserve.mockResolvedValue({ id: operationId });
  fixture.reserveResponse.mockResolvedValue({ id: operationId });
  fixture.execute.mockResolvedValue({ id: operationId, phase: 'applied' });
  fixture.readEvent.mockResolvedValue({ title: 'authoritative', locked: true });
  fixture.deletionResult.mockResolvedValue({
    message: 'Event deleted successfully',
    linkedTaskId: 'linked',
  });
  fixture.resolveColorChoice.mockResolvedValue({
    fields: { colorId: '', eventLabelId: 'label' },
    eventLabelVersion: 1,
  });
  fixture.inspect.mockResolvedValue({
    operation: {
      id: operationId,
      phase: 'dispatched',
      intent: { kind: 'mutation' },
    },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('generation-fenced Calendar mutation route contracts', () => {
  it('seals content, time, lock and palette fields together and returns authoritative finalized state', async () => {
    const response = await handleRecoverableGooglePut({
      ...args(),
      updates: {
        title: 'new title',
        description: 'new description',
        location: 'new location',
        start_at: '2026-10-02T08:00:00Z',
        end_at: '2026-10-02T09:00:00Z',
        locked: true,
        providerColor: { connectionId: 'owned', kind: 'label', id: 'label' },
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      title: 'authoritative',
      locked: true,
    });
    expect(fixture.reserve).toHaveBeenCalledWith({
      action: 'patch',
      providerPatch: {
        summary: 'new title',
        description: 'new description',
        location: 'new location',
        start: { dateTime: '2026-10-02T08:00:00Z' },
        end: { dateTime: '2026-10-02T09:00:00Z' },
        colorId: '',
        eventLabelId: 'label',
      },
      localPatch: { locked: true },
      eventLabelVersion: 1,
      sendUpdates: 'all',
    });
    expect(fixture.execute).toHaveBeenCalledWith(operationId);
  });
  it('does not invite attendees again for an isolated local lock change', async () => {
    await handleRecoverableGooglePut({ ...args(), updates: { locked: false } });
    expect(fixture.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        providerPatch: {},
        localPatch: { locked: false },
        sendUpdates: 'none',
      })
    );
  });
  it('leaves failed dispatched content recoverable and hides plaintext/provider failures', async () => {
    fixture.execute.mockRejectedValue(new Error('private-provider-secret'));
    const response = await handleRecoverableGooglePut({
      ...args(),
      updates: { title: 'private-title' },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Google calendar operation needs recovery',
      operationId,
    });
    expect(fixture.readEvent).not.toHaveBeenCalled();
    expect(fixture.cancel).not.toHaveBeenCalled();
  });
  it('does not report superseded content as applied', async () => {
    fixture.execute.mockResolvedValue({ phase: 'superseded' });
    const response = await handleRecoverableGooglePut({
      ...args(),
      updates: { title: 'title' },
    });
    expect(response.status).toBe(409);
    expect(fixture.readEvent).not.toHaveBeenCalled();
  });
  it('returns transaction-owned deletion link summary without a stale event read', async () => {
    const response = await handleRecoverableGoogleDelete(args());
    expect(await response.json()).toEqual({
      message: 'Event deleted successfully',
      linkedTaskId: 'linked',
    });
    expect(fixture.reserve).toHaveBeenCalledWith({
      action: 'delete',
      providerPatch: {},
      sendUpdates: 'all',
    });
    expect(fixture.deletionResult).toHaveBeenCalledWith(operationId);
    expect(fixture.readEvent).not.toHaveBeenCalled();
  });
  it('reauthorizes missing-row deletion recovery using only the strict operation ID', async () => {
    const { request: _, ...ids } = args();
    const request = new Request('https://fixture.invalid/events', {
      method: 'POST',
      body: JSON.stringify({ operationId }),
    });
    const response = await handleGoogleColorRecovery(
      request,
      ids.rawWsId,
      ids.eventId,
      'execute'
    );
    expect(response.status).toBe(200);
    expect(fixture.create).toHaveBeenCalledWith(
      request,
      ids.rawWsId,
      ids.eventId,
      { recoveryOperationId: operationId }
    );
    expect(fixture.colorCreate).not.toHaveBeenCalled();
  });
  it('rejects a stale recovery token before dispatching either ledger executor', async () => {
    fixture.inspect.mockResolvedValue({
      operation: { id: 'successor', intent: { kind: 'mutation' } },
    });
    const response = await handleGoogleColorRecovery(
      new Request('https://fixture.invalid', {
        method: 'POST',
        body: JSON.stringify({ operationId }),
      }),
      'workspace',
      'event',
      'execute'
    );
    expect(response.status).toBe(409);
    expect(fixture.execute).not.toHaveBeenCalled();
  });
  it('rejects forged recovery options before access or dispatch', async () => {
    const response = await handleGoogleColorRecovery(
      new Request('https://fixture.invalid', {
        method: 'POST',
        body: JSON.stringify({ operationId, force: true }),
      }),
      'workspace',
      'event',
      'execute'
    );
    expect(response.status).toBe(400);
    expect(fixture.create).not.toHaveBeenCalled();
  });
  it('preserves revocation failure instead of attempting stale deletion', async () => {
    fixture.create.mockRejectedValue(
      new ColorOperationError('unauthorized', 'private')
    );
    const response = await handleRecoverableGoogleDelete(args());
    expect(response.status).toBe(403);
    expect(fixture.reserve).not.toHaveBeenCalled();
  });
  it('settles a meeting response through the ledger before reporting delivery', async () => {
    const result = await handleRecoverableGoogleResponse({
      ...args(),
      response: 'tentative',
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ response: 'tentative' });
    expect(fixture.reserveResponse).toHaveBeenCalledWith('tentative');
    expect(fixture.execute).toHaveBeenCalledWith(operationId);
    expect(fixture.readEvent).toHaveBeenCalledTimes(1);
  });
  it('does not report a superseded invitation response as delivered', async () => {
    fixture.execute.mockResolvedValueOnce({ phase: 'superseded' });
    const result = await handleRecoverableGoogleResponse({
      ...args(),
      response: 'declined',
    });
    expect(result.status).toBe(409);
    expect(fixture.readEvent).not.toHaveBeenCalled();
  });
});
