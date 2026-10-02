// @vitest-environment node
import { chmod, mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatGPTEnabled, credentialPath, withChatGPTStore } from './storage';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tuturuuu-chatgpt-test-'));
  vi.stubEnv('CHATGPT_SUBSCRIPTIONS_DIR', directory);
  vi.stubEnv('OPENAI_CHATGPT_ENABLED', 'false');
  vi.stubEnv('TUTURUUU_DEPLOYMENT_MODE', 'hosted');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe('protected ChatGPT runtime storage', () => {
  it('requires explicit self-hosted opt-in', () => {
    expect(chatGPTEnabled()).toBe(false);
    vi.stubEnv('OPENAI_CHATGPT_ENABLED', 'true');
    expect(chatGPTEnabled()).toBe(false);
    vi.stubEnv('TUTURUUU_DEPLOYMENT_MODE', 'self-hosted');
    expect(chatGPTEnabled()).toBe(true);
  });
  it('persists opaque host IDs before attempts and separates Tuturuuu owners', async () => {
    const host = await withChatGPTStore(userA, async (store) => {
      store.registrations.push({
        clientId: 'oaiapp_test',
        subject: 'synthetic-subject',
        scopes: [],
      });
      return store.hostId;
    });
    expect(await withChatGPTStore(userA, async (store) => store.hostId)).toBe(
      host
    );
    expect(
      await withChatGPTStore(userB, async (store) => store.registrations)
    ).toEqual([]);
    if (process.platform !== 'win32') {
      expect((await stat(credentialPath(userA))).mode & 0o777).toBe(0o600);
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
    }
    expect(() => credentialPath('../other-user')).toThrow();
  });
  it('serializes concurrent credential mutations without losing a rotating token', async () => {
    await Promise.all(
      [1, 2].map((number) =>
        withChatGPTStore(userA, async (store) => {
          await new Promise((resolveWait) => setTimeout(resolveWait, 20));
          store.registrations.push({
            clientId: `oaiapp_${number}`,
            subject: `synthetic-${number}`,
            scopes: [],
          });
        })
      )
    );
    expect(
      JSON.parse(await readFile(credentialPath(userA), 'utf8')).registrations
    ).toHaveLength(2);
  });
  it('rejects permissive credential files and symlinked credentials', async () => {
    await withChatGPTStore(userA, async () => null);
    if (process.platform !== 'win32') {
      await chmod(credentialPath(userA), 0o644);
      await expect(withChatGPTStore(userA, async () => null)).rejects.toThrow(
        'owner-only'
      );
    }
    await symlink(credentialPath(userA), credentialPath(userB));
    await expect(withChatGPTStore(userB, async () => null)).rejects.toThrow();
  });
});
