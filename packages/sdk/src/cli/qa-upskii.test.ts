import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { runUpskiiQaCommand } from './qa-upskii';

const now = Date.parse('2026-11-28T09:00:00Z');
const expiresAt = '2026-11-28T11:00:00.000Z';
const password = 'disposable-password';
const token = 'fixture-session-token';
const bearer = 'fixture-provisioner-bearer';

it.each([false, true])(
  'writes a private session artifact only after exact identity readback (mismatch=%s)',
  async (mismatch) => {
    const dir = await mkdtemp(join(tmpdir(), 'ttr-upskii-'));
    const out = join(dir, 'state.json');
    let identity = { id: '', email: '' };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async (url, options) => {
        expect(options?.redirect).toBe('manual');
        if (String(url) === 'https://admin.upskii.com/api/admin/qa/users') {
          expect(new Headers(options?.headers).get('authorization')).toBe(
            'Bearer ' + bearer
          );
          const { requestId, runLabel, role, ttlSeconds } = JSON.parse(
            String(options?.body)
          );
          expect(ttlSeconds).toBe(7200);
          expect(role).toBe('teacher');
          identity = {
            id: requestId,
            email: 'qa-fleet+' + runLabel + '-teacher@tuturuuu.com',
          };
          return Response.json(
            {
              userId: requestId,
              createdByRequestId: requestId,
              isTest: true,
              outcome: 'created',
              user: {
                userId: requestId,
                email: identity.email,
                runLabel,
                role,
                expiresAt,
                password,
              },
            },
            { status: 201 }
          );
        }
        expect(new Headers(options?.headers).has('authorization')).toBe(false);
        if (String(url) === 'https://upskii.com/api/auth/password') {
          expect(String(options?.body)).toContain('password=' + password);
          return new Response(null, {
            status: 303,
            headers: {
              'set-cookie':
                'upskii.session_token=' +
                token +
                '; Domain=.upskii.com; Path=/; Secure; HttpOnly; Max-Age=86400; SameSite=Lax',
            },
          });
        }
        expect(String(url)).toBe(
          'https://app.upskii.com/api/auth/get-session?disableCookieCache=true&disableRefresh=true'
        );
        expect(new Headers(options?.headers).get('cookie')).toBe(
          'upskii.session_token=' + token
        );
        return Response.json({
          user: mismatch
            ? { ...identity, email: 'other@example.com' }
            : identity,
        });
      });
    const write = vi.fn();
    try {
      const operation = runUpskiiQaCommand(
        {
          flags: { product: 'upskii', role: 'teacher', out },
          positionals: ['session'],
        },
        { fetch, write, now: () => now, readBearer: async () => bearer }
      );
      if (mismatch) {
        await expect(operation).rejects.toThrow(/Reconcile request/u);
        await expect(stat(out)).rejects.toThrow();
        expect(write).not.toHaveBeenCalled();
      } else {
        await operation;
        expect((await stat(out)).mode & 0o777).toBe(0o600);
        const state = JSON.parse(await readFile(out, 'utf8'));
        expect(state.cookies[0]).toMatchObject({
          value: token,
          expires: Date.parse(expiresAt) / 1000,
          domain: '.upskii.com',
        });
        for (const value of [token, bearer, password])
          expect(write.mock.calls[0]?.[0]).not.toContain(value);
      }
      expect(fetch).toHaveBeenCalledTimes(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);

it('refuses a non-disposable role before reading the Keychain', async () => {
  const readBearer = vi.fn();
  await expect(
    runUpskiiQaCommand(
      {
        flags: { product: 'upskii', role: 'admin' },
        positionals: ['account', 'issue'],
      },
      { fetch: vi.fn(), write: vi.fn(), now: () => now, readBearer }
    )
  ).rejects.toThrow(/teacher and student/u);
  expect(readBearer).not.toHaveBeenCalled();
});

it('does not retry or print a provisioner denial body', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(Response.json({ error: bearer }, { status: 403 }));
  await expect(
    runUpskiiQaCommand(
      {
        flags: { product: 'upskii', role: 'student' },
        positionals: ['account', 'issue'],
      },
      { fetch, write: vi.fn(), now: () => now, readBearer: async () => bearer }
    )
  ).rejects.toThrow(/Reconcile request/u);
  expect(fetch).toHaveBeenCalledTimes(1);
});
