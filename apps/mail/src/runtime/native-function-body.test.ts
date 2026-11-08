import { describe, expect, it } from 'vitest';
import {
  boundNativeFunctionRequest,
  MAIL_FUNCTION_BODY_LIMIT,
} from './native-function-body';

const url = 'https://mail.tuturuuu.com/_mail/functions/action';
describe('native action body bound inherited from Next server actions', () => {
  it('retains exact bytes and identity for an accepted body', async () => {
    const raw = '{ "draft": "original-operation" }\n';
    const result = await boundNativeFunctionRequest(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'app=original' },
        body: raw,
      })
    );
    expect(result).toBeInstanceOf(Request);
    if (!(result instanceof Request)) throw new Error('Expected request');
    expect(await result.text()).toBe(raw);
    expect(result.headers.get('cookie')).toBe('app=original');
  });
  it('bounds bodies even without content-length and never passes overflow to a supplier', async () => {
    const result = await boundNativeFunctionRequest(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: new Uint8Array(MAIL_FUNCTION_BODY_LIMIT + 1),
      })
    );
    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error('Expected response');
    expect(result.status).toBe(413);
  });
  it('leaves non-POST and wrong content-type to the method/CSRF proxy', async () => {
    const request = new Request(url, { method: 'GET' });
    expect(await boundNativeFunctionRequest(request)).toBe(request);
    const wrong = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'untouched',
    });
    expect(await boundNativeFunctionRequest(wrong)).toBe(wrong);
    expect(await wrong.text()).toBe('untouched');
  });
});

import { prepareMailFunctionRequest } from './native-function-body';

it.each(['https://mail.tuturuuu.com', 'https://tuturuuu.com/mail'])(
  'serves legacy RPC bytes at the new function base without redirect on %s',
  async (base) => {
    const body = '{ "operation": "original" }\n';
    const prepared = await prepareMailFunctionRequest(
      new Request(`${base}/_mail/functions/id?revision=original`, {
        method: 'POST',
        body,
        headers: {
          'content-type': 'application/json',
          'x-original': 'fixture',
        },
      })
    );
    expect(prepared).toBeInstanceOf(Request);
    if (!(prepared instanceof Request))
      throw new Error('Legacy function request rejected');
    expect(prepared.url).toBe(`${base}/_fn/id?revision=original`);
    expect(prepared.headers.get('x-original')).toBe('fixture');
    expect(await prepared.text()).toBe(body);
  }
);
