import { describe, expect, it, vi } from 'vitest';

// React's `registerServerReference`, as plugin-rsc applies it to exports.
function registered<T extends (...args: never[]) => unknown>(
  fn: T,
  id: string
) {
  return Object.defineProperties(fn, {
    $$typeof: { value: Symbol.for('react.server.reference') },
    $$id: { value: id, configurable: true },
  });
}

const echo = registered(
  (...args: unknown[]) =>
    args.map((arg) =>
      arg instanceof FormData ? `form:${arg.get('name')}` : arg
    ),
  'k1#known'
);
const nothing = registered(async () => undefined, 'k1#nothing');

vi.mock('@vitejs/plugin-rsc/rsc', () => ({
  // Like plugin-rsc: `module[name]` with no own-property check.
  loadServerAction: async (id: string) => {
    const [key, name] = id.split('#');
    const module: Record<string, unknown> =
      key === 'k1' ? { known: echo, nothing, alias: echo } : {};
    return module[name as string];
  },
  // React's reply encoding: JSON for plain arguments, FormData for forms.
  decodeReply: async (body: string | FormData) =>
    typeof body === 'string' ? JSON.parse(body) : [body],
}));

const {
  decodeActionCall,
  encodeActionCall,
  MAX_ACTION_BYTES,
  MAX_ACTION_ENTRIES,
  runServerAction,
} = await import('./server-actions');

describe('server action transport', () => {
  it('runs a registered action with decoded arguments', async () => {
    expect(
      await runServerAction({ id: 'k1#known', reply: JSON.stringify([2, 'x']) })
    ).toEqual({ value: [2, 'x'] });
  });

  it('carries form replies, files included, through JSON', async () => {
    const form = new FormData();
    form.set('name', 'Ada');
    form.set(
      'avatar',
      new File([new Uint8Array([1, 2, 255])], 'a.png', { type: 'image/png' })
    );
    const call = await encodeActionCall('k1#known', form);
    // Plain JSON, as the function proxy requires.
    const decoded = decodeActionCall(JSON.parse(JSON.stringify(call)));
    const file = (decoded as FormData).get('avatar') as File;
    expect([file.name, file.type]).toEqual(['a.png', 'image/png']);
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 255]);
    expect(await runServerAction(call)).toEqual({ value: ['form:Ada'] });
  });

  it('boxes an undefined result so the transport keeps a body', async () => {
    expect(await runServerAction({ id: 'k1#nothing', reply: '[]' })).toEqual({
      value: undefined,
    });
  });

  it('runs only the reference registered under exactly that id', async () => {
    for (const id of ['k1#constructor', 'k1#toString', 'k1#alias', 'k2#known'])
      await expect(runServerAction({ id, reply: '[]' }), id).rejects.toThrow(
        'Unknown server action'
      );
    for (const id of ['k1', '#known', 'k1#known#x', 'k1#1x', 'k 1#known'])
      await expect(runServerAction({ id, reply: '[]' }), id).rejects.toThrow(
        'Invalid server action call'
      );
  });

  it('bounds the whole call in UTF-8 bytes before decoding', () => {
    const over = MAX_ACTION_BYTES + 1;
    const cases: unknown[] = [
      // A plain reply is measured too.
      { id: 'k1#known', reply: 'x'.repeat(over) },
      // Two-byte characters under the UTF-16 length still exceed the bytes.
      { id: 'k1#known', reply: 'é'.repeat(Math.ceil(over / 2)) },
      { id: 'k1#known', form: [['big', 'x'.repeat(over)]] },
      // Names count.
      { id: 'k1#known', form: [['n'.repeat(over), '']] },
      // File metadata and contents count.
      {
        id: 'k1#known',
        form: [['f', { name: 'a', type: 't'.repeat(over), base64: '' }]],
      },
      {
        id: 'k1#known',
        form: [['f', { name: 'a', type: 't', base64: 'A'.repeat(over) }]],
      },
      // Many empty entries.
      {
        id: 'k1#known',
        form: Array.from({ length: MAX_ACTION_ENTRIES + 1 }, () => ['', '']),
      },
    ];
    for (const call of cases)
      expect(() => decodeActionCall(call as never)).toThrow('too large');
    expect(() =>
      decodeActionCall({
        id: 'k1#known',
        form: Array.from({ length: MAX_ACTION_ENTRIES }, () => ['', '']),
      })
    ).not.toThrow();
  });

  it('rejects malformed calls', async () => {
    for (const call of [
      { id: 'k1#known' },
      { id: 'k1#known', form: [[1, 'x']] },
      { id: 'k1#known', form: [['f', { name: 'a' }]] },
      null,
    ])
      await expect(runServerAction(call as never)).rejects.toThrow(
        'Invalid server action call'
      );
  });
});
