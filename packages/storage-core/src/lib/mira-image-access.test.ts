import { describe, expect, it, vi } from 'vitest';
import {
  isMiraImagePath,
  type MiraImageAccessContext,
  resolveMiraImageReadAccess,
} from './mira-image-access';

const WS = '5707a6e0-0000-4000-8000-000000009711';
const IMAGE = `${WS}/mira/images/0b046a4f-8fc5-41bf-8b2b-1ec94abd0362.png`;

function context(
  overrides: Partial<MiraImageAccessContext> = {}
): MiraImageAccessContext {
  return {
    userId: 'creator',
    isWorkspaceMember: vi.fn(async (wsId: string) => wsId === WS),
    isImageGeneratedBy: vi.fn(
      async (name: string, userId: string) =>
        name === IMAGE && userId === 'creator'
    ),
    ...overrides,
  };
}

describe('isMiraImagePath', () => {
  it('accepts only direct mira/images objects', () => {
    expect(isMiraImagePath(IMAGE)).toBe(true);
    // Re-keyed names keep the same directory.
    expect(isMiraImagePath(`${WS}/mira/images/uuid-original.png`)).toBe(true);
    for (const name of [
      `${WS}/mira/images`,
      `${WS}/mira/images/nested/a.png`,
      `${WS}/mira/qr/a.png`,
      `${WS}/drive/mira/images/a.png`,
      `${WS}/Mira/Images/a.png`,
      `${WS}/mira/images/..`,
      `${WS}/mira/images/%2e%2e`,
      `${WS}/chats/ai/resources/chat/a.png`,
      'not-a-workspace/mira/images/a.png',
    ]) {
      expect(isMiraImagePath(name), name).toBe(false);
    }
  });
});

describe('resolveMiraImageReadAccess', () => {
  it('allows the generating member', async () => {
    await expect(resolveMiraImageReadAccess(IMAGE, context())).resolves.toBe(
      'allowed'
    );
  });

  it('denies another member of the workspace', async () => {
    await expect(
      resolveMiraImageReadAccess(IMAGE, context({ userId: 'other-member' }))
    ).resolves.toBe('forbidden');
  });

  it('denies the generator after they leave the workspace', async () => {
    const ctx = context({ isWorkspaceMember: vi.fn(async () => false) });
    await expect(resolveMiraImageReadAccess(IMAGE, ctx)).resolves.toBe(
      'forbidden'
    );
    expect(ctx.isImageGeneratedBy).not.toHaveBeenCalled();
  });

  it('rejects other roots without any lookup', async () => {
    const ctx = context();
    await expect(
      resolveMiraImageReadAccess(`${WS}/recordings/a.webm`, ctx)
    ).resolves.toBe('invalid');
    expect(ctx.isWorkspaceMember).not.toHaveBeenCalled();
  });

  it('propagates lookup failures', async () => {
    const ctx = context({
      isImageGeneratedBy: vi.fn(async () => {
        throw new Error('lookup failed');
      }),
    });
    await expect(resolveMiraImageReadAccess(IMAGE, ctx)).rejects.toThrow(
      'lookup failed'
    );
  });
});
