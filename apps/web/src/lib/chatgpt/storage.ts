import { getCloudflareContext } from '@opennextjs/cloudflare/cloudflare-context';
import { fsChatGPTStorage } from './storage-fs';
import { type ChatGPTBucket, createR2ChatGPTStorage } from './storage-r2';
import {
  assertChatGPTUserId,
  type ChatGPTStorageAdapter,
  type ChatGPTStore,
} from './storage-schema';

export { credentialDirectory, credentialPath } from './storage-fs';
export {
  type ChatGPTRegistration,
  type ChatGPTStorageAdapter,
  type ChatGPTStore,
  registrationSchema,
} from './storage-schema';

declare global {
  interface CloudflareEnv {
    CHATGPT_FILES?: ChatGPTBucket;
  }
}

export function chatGPTEnabled() {
  return (
    process.env.TUTURUUU_DEPLOYMENT_MODE === 'self-hosted' &&
    process.env.OPENAI_CHATGPT_ENABLED === 'true'
  );
}

/** The Worker's CHATGPT_FILES R2 bucket, or null outside a Worker. */
function boundBucket(): ChatGPTBucket | null {
  try {
    return getCloudflareContext().env.CHATGPT_FILES ?? null;
  } catch {
    return null;
  }
}

let r2Storage: {
  bucket: ChatGPTBucket;
  adapter: ChatGPTStorageAdapter;
} | null = null;

/** R2 when the Worker binds CHATGPT_FILES; owner-only files otherwise. */
export function chatGPTStorage(): ChatGPTStorageAdapter {
  const bucket = boundBucket();
  if (!bucket) return fsChatGPTStorage;
  if (r2Storage?.bucket !== bucket)
    r2Storage = { bucket, adapter: createR2ChatGPTStorage(bucket) };
  return r2Storage.adapter;
}

/** A coherent read-only snapshot; mutations go through `withChatGPTStore`. */
export async function readChatGPTStore(userId: string) {
  assertChatGPTUserId(userId);
  return chatGPTStorage().read(userId);
}

/** Serializes one user's credential mutations (rotating refresh tokens). */
export async function withChatGPTStore<T>(
  userId: string,
  operation: (store: ChatGPTStore) => Promise<T>
): Promise<T> {
  assertChatGPTUserId(userId);
  return chatGPTStorage().withStore(userId, operation);
}
