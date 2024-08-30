import { v4 as UUIDv4, v5 as UUIDv5 } from 'uuid';

export function generateUUID(...uuids: string[]): string {
  const name = uuids.join('-');
  const namespace = '5b5b7b9f-6432-4c40-b97b-9bd0abb080cf';
  return UUIDv5(name, namespace);
}

export function generateRandomUUID(): string {
  return UUIDv4();
}
