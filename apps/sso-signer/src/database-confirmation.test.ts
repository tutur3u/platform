import { fieldsHash } from '@tuturuuu/sso/signer-permit';
import { serviceProvider } from '@tuturuuu/sso/testing';
import { describe, expect, it, vi } from 'vite-plus/test';
import { signerHarness, signInput } from './__tests__/harness';
import {
  type ConfirmedFields,
  type ConfirmQuery,
  createDatabaseConfirmation,
} from './database-confirmation';
import type { SignInput } from './input';

const SUBJECT = 'a'.repeat(64);

/** The function's answer for exactly this request. */
function rowFor(input: SignInput): ConfirmedFields {
  return {
    client_id: input.client,
    acs_url: input.profile.acsUrl,
    sp_entity_id: input.profile.entityId,
    in_response_to: input.request.id,
    subject: input.subject,
    email: input.attributes.email,
    given_name: input.attributes.firstName,
    family_name: input.attributes.lastName,
    kid: input.kid,
  };
}

async function harness(answer: (input: SignInput) => unknown) {
  const calls: Parameters<ConfirmQuery>[0][] = [];
  let current: SignInput | null = null;
  const query: ConfirmQuery = async (args) => {
    calls.push(args);
    return answer(current as SignInput);
  };
  const h = await signerHarness({
    confirmation: createDatabaseConfirmation({ query }),
  });
  const input = { ...signInput(h.f), subject: SUBJECT };
  current = input;
  const signer = vi.spyOn(h.deps, 'createSigner');
  const response = await h.handle(await h.validRequest(input));
  return {
    h,
    input,
    calls,
    signer,
    response,
    body: (await response.json()) as Record<string, string>,
  };
}

describe('database transaction confirmation in the sign handler', () => {
  it('signs when the stored fields match the request exactly', async () => {
    const run = await harness(rowFor);
    expect(run.response.status, JSON.stringify(run.body)).toBe(200);
    expect(run.calls).toEqual([
      {
        transactionId: run.input.transactionId,
        clientId: run.input.client,
        kid: run.input.kid,
      },
    ]);
    const xml = Buffer.from(run.body.samlResponse ?? '', 'base64').toString();
    const profile = await (await serviceProvider(run.h.f)).accept(xml);
    expect(profile.nameID).toBe(SUBJECT);
  });

  it('refuses a NULL answer without parsing a key', async () => {
    const run = await harness(() => null);
    expect(run.response.status).toBe(403);
    expect(run.body.error).toBe('transaction_unconfirmed');
    expect(run.signer).not.toHaveBeenCalled();
  });

  it('refuses a stored field that differs from the request', async () => {
    const run = await harness((input) => ({
      ...rowFor(input),
      acs_url: 'https://attacker.example.test/acs',
    }));
    expect(run.response.status).toBe(403);
    expect(run.body.error).toBe('transaction_unconfirmed');
    expect(run.signer).not.toHaveBeenCalled();
  });

  it('refuses when the query fails, once and without retrying', async () => {
    const run = await harness(() => {
      throw new Error('connection reset');
    });
    expect(run.response.status).toBe(503);
    expect(run.body.error).toBe('confirmation_unavailable');
    expect(run.calls).toHaveLength(1);
    expect(run.signer).not.toHaveBeenCalled();
  });
});

describe('database transaction confirmation', () => {
  const input = async () => {
    const h = await signerHarness();
    const fields = { ...signInput(h.f), subject: SUBJECT };
    return { fields, permit: { fields: await fieldsHash(fields) } };
  };
  const answer =
    (value: unknown): ConfirmQuery =>
    async () =>
      value;

  it('confirms the exact stored fields', async () => {
    const { fields, permit } = await input();
    const confirmation = createDatabaseConfirmation({
      query: answer(rowFor(fields)),
    });
    expect(await confirmation.confirm(fields, permit)).toEqual({ ok: true });
  });

  it('refuses a mismatch on every bound field', async () => {
    const { fields, permit } = await input();
    const row = rowFor(fields);
    const changed: Record<keyof ConfirmedFields, string> = {
      client_id: '00000000-0000-4000-8000-0000000000aa',
      acs_url: 'https://other.example.test/acs',
      sp_entity_id: 'urn:other:sp',
      in_response_to: '_other-request',
      subject: 'b'.repeat(64),
      email: 'other@example.test',
      given_name: 'Other',
      family_name: 'Person',
      kid: 'other-kid',
    };
    for (const key of Object.keys(changed) as (keyof ConfirmedFields)[]) {
      const confirmation = createDatabaseConfirmation({
        query: answer({ ...row, [key]: changed[key] }),
      });
      expect(await confirmation.confirm(fields, permit), key).toEqual({
        ok: false,
        error: 'transaction_unconfirmed',
      });
    }
  });

  it('refuses stored fields that match the request but not the permit', async () => {
    const { fields } = await input();
    const confirmation = createDatabaseConfirmation({
      query: answer(rowFor(fields)),
    });
    const other = await fieldsHash({ ...fields, notOnOrAfter: 'x' });
    expect(await confirmation.confirm(fields, { fields: other })).toEqual({
      ok: false,
      error: 'transaction_unconfirmed',
    });
  });

  it('refuses NULL as unconfirmed and any other shape as unavailable', async () => {
    const { fields, permit } = await input();
    const row = rowFor(fields);
    const check = async (value: unknown) =>
      createDatabaseConfirmation({ query: answer(value) }).confirm(
        fields,
        permit
      );
    expect(await check(null)).toEqual({
      ok: false,
      error: 'transaction_unconfirmed',
    });
    for (const value of [
      undefined,
      'null',
      [],
      [row],
      { ...row, extra: 'x' },
      { ...row, given_name: null },
      { ...row, subject: fields.client },
      JSON.stringify(row),
    ]) {
      expect(await check(value), JSON.stringify(value)).toEqual({
        ok: false,
        error: 'confirmation_unavailable',
      });
    }
  });

  it('refuses at the deadline, aborts the query and makes one attempt', async () => {
    const { fields, permit } = await input();
    let calls = 0;
    let aborted = false;
    const confirmation = createDatabaseConfirmation({
      timeoutMs: 50,
      query: (_args, signal) => {
        calls += 1;
        signal.addEventListener('abort', () => {
          aborted = true;
        });
        return new Promise(() => {});
      },
    });
    const started = Date.now();
    expect(await confirmation.confirm(fields, permit)).toEqual({
      ok: false,
      error: 'confirmation_unavailable',
    });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(aborted).toBe(true);
    expect(calls).toBe(1);
  });

  it('aborts the query signal after a normal answer too', async () => {
    const { fields, permit } = await input();
    let signal: AbortSignal | null = null;
    const confirmation = createDatabaseConfirmation({
      query: async (_args, received) => {
        signal = received;
        return rowFor(fields);
      },
    });
    expect(await confirmation.confirm(fields, permit)).toEqual({ ok: true });
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
  });
});
