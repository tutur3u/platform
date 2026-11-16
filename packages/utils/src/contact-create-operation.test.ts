import { describe, expect, it, vi } from 'vitest';
import {
  type ContactOperationRecord,
  type ContactOperationStore,
  contactOperationId,
  createContactOperation,
  reconcileContactOperation,
} from './contact-create-operation';

const scope = {
  actorId: 'actor',
  workspaceId: 'workspace',
  operationId: 'operation',
};
const input = {
  operationId: scope.operationId,
  email: 'sender@example.com',
  displayName: 'Sender',
};

function memoryStore() {
  const rows = new Map<string, ContactOperationRecord>();
  const find = vi.fn(
    async ({ contactId }: { workspaceId: string; contactId: string }) =>
      rows.get(contactId) ?? null
  );
  const create = vi.fn<ContactOperationStore['create']>(async (request) => {
    if (rows.has(request.contactId)) throw new Error('duplicate');
    rows.set(request.contactId, {
      id: request.contactId,
      email: request.email,
      displayName: request.displayName,
    });
  });
  return { rows, store: { find, create } };
}

describe('contact create operations', () => {
  it('binds contact identity to the actor, workspace and immutable operation', () => {
    const id = contactOperationId(scope);
    expect(contactOperationId({ ...scope })).toBe(id);
    for (const changed of [
      { ...scope, actorId: 'other' },
      { ...scope, workspaceId: 'other' },
      { ...scope, operationId: 'other' },
    ])
      expect(contactOperationId(changed)).not.toBe(id);
  });

  it('creates once and returns only the contact ID when the operation repeats', async () => {
    const { rows, store } = memoryStore();
    const result = await createContactOperation(store, scope, input);
    expect(result).toEqual({
      state: 'created',
      contactId: contactOperationId(scope),
    });
    expect(await createContactOperation(store, scope, input)).toEqual(result);
    expect(store.create).toHaveBeenCalledTimes(1);
    expect(rows.size).toBe(1);
    expect(store.find).toHaveBeenCalledWith({
      workspaceId: scope.workspaceId,
      contactId: contactOperationId(scope),
    });
  });

  it('concurrent identical submits converge on one record', async () => {
    const { rows, store } = memoryStore();
    const results = await Promise.all([
      createContactOperation(store, scope, input),
      createContactOperation(store, scope, input),
    ]);
    expect(results).toEqual([
      { state: 'created', contactId: contactOperationId(scope) },
      { state: 'created', contactId: contactOperationId(scope) },
    ]);
    expect(rows.size).toBe(1);
  });

  it('does not overwrite an existing operation with different contact data', async () => {
    const { rows, store } = memoryStore();
    await createContactOperation(store, scope, input);
    expect(
      await createContactOperation(store, scope, {
        ...input,
        email: 'other@example.com',
      })
    ).toEqual({ state: 'conflict' });
    expect(rows.get(contactOperationId(scope))?.email).toBe(input.email);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it('reconciles a committed write whose RPC response was lost', async () => {
    const { rows, store } = memoryStore();
    store.create.mockImplementation(async (request) => {
      rows.set(request.contactId, {
        id: request.contactId,
        email: request.email,
        displayName: request.displayName,
      });
      throw new Error('response lost');
    });
    expect(await createContactOperation(store, scope, input)).toEqual({
      state: 'created',
      contactId: contactOperationId(scope),
    });
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it('keeps an unobserved write UNKNOWN and later reconciles without another write', async () => {
    const { rows, store } = memoryStore();
    store.create.mockRejectedValue(new Error('outcome unknown'));
    expect(await createContactOperation(store, scope, input)).toEqual({
      state: 'unknown',
    });
    expect(await reconcileContactOperation(store, scope)).toEqual({
      state: 'unknown',
    });
    rows.set(contactOperationId(scope), {
      id: contactOperationId(scope),
      email: input.email,
      displayName: input.displayName,
    });
    expect(await reconcileContactOperation(store, scope)).toEqual({
      state: 'created',
      contactId: contactOperationId(scope),
    });
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it('does not write when the initial read cannot be confirmed', async () => {
    const { store } = memoryStore();
    store.find.mockRejectedValue(new Error('read unavailable'));
    expect(await createContactOperation(store, scope, input)).toEqual({
      state: 'unknown',
    });
    expect(await reconcileContactOperation(store, scope)).toEqual({
      state: 'unknown',
    });
    expect(store.create).not.toHaveBeenCalled();
  });
});
