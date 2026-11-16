import { generateUUID } from '@tuturuuu/utils/uuid-helper';

type OperationStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function senderContactStorageKey(
  actorId: string,
  workspaceId: string,
  email: string
) {
  return `mail-contact-operation:${generateUUID(
    JSON.stringify([actorId, workspaceId, email.trim().toLowerCase()])
  )}`;
}

export function reserveSenderContactOperation(
  storage: OperationStorage,
  key: string,
  randomUUID: () => string
): { kind: 'new' | 'existing'; operationId: string } {
  const existing = storage.getItem(key);
  if (existing !== null) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        existing
      )
    ) {
      throw new Error('Contact operation storage is invalid');
    }
    return { kind: 'existing', operationId: existing };
  }
  const operationId = randomUUID();
  storage.setItem(key, operationId);
  if (storage.getItem(key) !== operationId)
    throw new Error('Contact operation was not retained');
  return { kind: 'new', operationId };
}
