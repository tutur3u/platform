import type {
  ContactCreateOperationInput,
  ContactCreateOperationResult,
} from '@tuturuuu/types/primitives/contact-create-operation';
import { generateUUID } from './uuid-helper';

export interface ContactOperationScope {
  actorId: string;
  workspaceId: string;
  operationId: string;
}

export interface ContactOperationRecord {
  id: string;
  email: string | null;
  displayName: string | null;
}

export interface ContactOperationStore {
  find(input: {
    workspaceId: string;
    contactId: string;
  }): Promise<ContactOperationRecord | null>;
  create(
    input: ContactOperationScope & {
      contactId: string;
      email: string;
      displayName: string | null;
    }
  ): Promise<void>;
}

export function contactOperationId(scope: ContactOperationScope): string {
  return generateUUID(
    JSON.stringify([
      'mail-contact-create-v1',
      scope.actorId,
      scope.workspaceId,
      scope.operationId.toLowerCase(),
    ])
  );
}

export async function reconcileContactOperation(
  store: ContactOperationStore,
  scope: ContactOperationScope
): Promise<ContactCreateOperationResult> {
  try {
    const contact = await store.find({
      workspaceId: scope.workspaceId,
      contactId: contactOperationId(scope),
    });
    return contact
      ? { state: 'created', contactId: contact.id }
      : { state: 'unknown' };
  } catch {
    return { state: 'unknown' };
  }
}

export async function createContactOperation(
  store: ContactOperationStore,
  scope: ContactOperationScope,
  input: ContactCreateOperationInput
): Promise<ContactCreateOperationResult> {
  const contactId = contactOperationId(scope);
  const lookup = { workspaceId: scope.workspaceId, contactId };
  const resultFor = (
    contact: ContactOperationRecord
  ): ContactCreateOperationResult =>
    contact.email === input.email && contact.displayName === input.displayName
      ? { state: 'created', contactId: contact.id }
      : { state: 'conflict' };
  try {
    const existing = await store.find(lookup);
    if (existing) return resultFor(existing);
  } catch {
    return { state: 'unknown' };
  }
  try {
    await store.create({
      ...scope,
      contactId,
      email: input.email,
      displayName: input.displayName,
    });
    return { state: 'created', contactId };
  } catch {
    // A concurrent insert or lost RPC response may already have committed.
    try {
      const existing = await store.find(lookup);
      return existing ? resultFor(existing) : { state: 'unknown' };
    } catch {
      return { state: 'unknown' };
    }
  }
}
