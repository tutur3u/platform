import { z } from 'zod';

export const registrationSchema = z.object({
  clientId: z.string().startsWith('oaiapp_'),
  subject: z.string().min(1),
  email: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  idToken: z.string().optional(),
  expiresAt: z.number().optional(),
  scopes: z.array(z.string()),
  remoteRevoked: z.boolean().optional(),
});
export type ChatGPTRegistration = z.infer<typeof registrationSchema>;

export const storeSchema = z.object({
  hostId: z.string().startsWith('urn:uuid:'),
  registrations: z.array(registrationSchema),
});
export type ChatGPTStore = z.infer<typeof storeSchema>;

/** Throws unless `userId` is a Tuturuuu user UUID; it keys every store. */
export function assertChatGPTUserId(userId: string) {
  if (!z.uuid().safeParse(userId).success)
    throw new Error('Invalid Tuturuuu user ID');
}

export function emptyChatGPTStore(): ChatGPTStore {
  return { hostId: `urn:uuid:${crypto.randomUUID()}`, registrations: [] };
}

/**
 * One backend for the per-user credential stores. `withStore` serializes
 * mutations for one user, persists the store before `operation` (so the host
 * ID survives a failed authorization) and again after it.
 */
export interface ChatGPTStorageAdapter {
  read(userId: string): Promise<ChatGPTStore>;
  withStore<T>(
    userId: string,
    operation: (store: ChatGPTStore) => Promise<T>
  ): Promise<T>;
}
