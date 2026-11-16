export type ContactCreateOperationResult =
  | { state: 'created'; contactId: string }
  | { state: 'unknown' }
  | { state: 'conflict' };

export type ContactCreateOperationInput = {
  operationId: string;
  email: string;
  displayName: string | null;
};
