import { describe, expect, it } from 'vitest';
import { base64 } from '../protocol';
import { authorize, encode, hash } from './assertion';
import type { Identity } from './contracts';

const id = '00000000-0000-4000-8000-000000000001';

describe('Fleet Board assertions', () => {
  it('accepts both Ed25519 keys and binds writes to the method, target, body and replay key', async () => {
    const a = await crypto.subtle.generateKey('Ed25519', true, [
      'sign',
      'verify',
    ]);
    const b = await crypto.subtle.generateKey('Ed25519', true, [
      'sign',
      'verify',
    ]);
    if (!('publicKey' in a) || !('publicKey' in b))
      throw new Error('Expected an Ed25519 key pair');
    const env = {
      BOARD_PUBLIC_KEY_A: base64(
        await crypto.subtle.exportKey('raw', a.publicKey)
      ),
      BOARD_PUBLIC_KEY_B: base64(
        await crypto.subtle.exportKey('raw', b.publicKey)
      ),
    } as Env;
    const url = 'https://board.invalid/board/control/stop';
    const body = JSON.stringify({ stopped: true, expectedGeneration: 1 });
    for (const [kid, pair] of [
      ['a', a],
      ['b', b],
    ] as const) {
      const now = Date.now();
      const identity: Identity = {
        kid,
        workspaceId: id,
        boardId: id,
        userId: id,
        actor: `user:${id}`,
        manager: true,
        agentActive: false,
        issuedAt: now,
        expiresAt: now + 60_000,
      };
      const payload = base64(encode(JSON.stringify(identity)).buffer);
      const claims = [
        'tuturuuu-board-v2',
        payload,
        'PUT',
        '/board/control/stop',
        await hash(encode(body)),
        id,
      ];
      const signature = base64(
        await crypto.subtle.sign(
          'Ed25519',
          pair.privateKey,
          encode(JSON.stringify(claims))
        )
      );
      const request = (
        target = url,
        method = 'PUT',
        json = body,
        replay = id
      ) =>
        new Request(target, {
          method,
          body: json,
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': replay,
            'X-Board-Assertion': `${payload}.${signature}`,
          },
        });
      await expect(authorize(request(), env)).resolves.toMatchObject({
        actor: identity,
      });
      await expect(authorize(request(url, 'POST'), env)).rejects.toThrow(
        'unauthenticated'
      );
      await expect(authorize(request(`${url}?other=1`), env)).rejects.toThrow(
        'unauthenticated'
      );
      await expect(authorize(request(url, 'PUT', '{}'), env)).rejects.toThrow(
        'unauthenticated'
      );
      await expect(
        authorize(request(url, 'PUT', body, crypto.randomUUID()), env)
      ).rejects.toThrow('unauthenticated');
    }
  });
});
