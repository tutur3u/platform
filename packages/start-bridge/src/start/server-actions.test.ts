import { describe, expect, it, vi } from 'vitest';

vi.mock('@vitejs/plugin-rsc/rsc', () => ({
  loadServerAction: async (id: string) =>
    id === 'known'
      ? (...args: unknown[]) =>
          args.map((arg) =>
            arg instanceof FormData ? `form:${arg.get('name')}` : arg
          )
      : id === 'void'
        ? async () => undefined
        : undefined,
  // React's reply encoding: JSON for plain arguments, FormData for forms.
  decodeReply: async (body: string | FormData) =>
    typeof body === 'string' ? JSON.parse(body) : [body],
}));

const {
  decodeActionCall,
  encodeActionCall,
  MAX_ACTION_FORM_BYTES,
  runServerAction,
} = await import('./server-actions');

describe('server action transport', () => {
  it('runs a registered action with decoded arguments', async () => {
    expect(
      await runServerAction({ id: 'known', reply: JSON.stringify([2, 'x']) })
    ).toEqual({ value: [2, 'x'] });
  });

  it('carries form replies, files included, through JSON', async () => {
    const form = new FormData();
    form.set('name', 'Ada');
    form.set(
      'avatar',
      new File([new Uint8Array([1, 2, 255])], 'a.png', {
        type: 'image/png',
      })
    );
    const call = await encodeActionCall('known', form);
    // Plain JSON, as the function proxy requires.
    const decoded = decodeActionCall(JSON.parse(JSON.stringify(call)));
    expect(decoded).toBeInstanceOf(FormData);
    const file = (decoded as FormData).get('avatar') as File;
    expect([file.name, file.type]).toEqual(['a.png', 'image/png']);
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 255]);
    expect(await runServerAction(call)).toEqual({ value: ['form:Ada'] });
  });

  it('boxes an undefined result so the transport keeps a body', async () => {
    expect(await runServerAction({ id: 'void', reply: '[]' })).toEqual({
      value: undefined,
    });
  });

  it('rejects malformed, oversized and unknown calls', async () => {
    await expect(runServerAction({ id: 'known' } as never)).rejects.toThrow(
      'Invalid server action call'
    );
    await expect(
      runServerAction({ id: 'known', form: [[1, 'x']] } as never)
    ).rejects.toThrow('Invalid server action call');
    await expect(
      runServerAction({
        id: 'known',
        form: [['big', 'x'.repeat(MAX_ACTION_FORM_BYTES + 1)]],
      })
    ).rejects.toThrow('too large');
    await expect(
      runServerAction({ id: 'missing', reply: '[]' })
    ).rejects.toThrow('Unknown server action');
  });
});
