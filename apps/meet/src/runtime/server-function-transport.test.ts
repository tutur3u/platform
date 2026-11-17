import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({
  methods: [] as string[],
  send: vi.fn(),
}));
vi.mock('@tanstack/react-start', () => ({
  createServerFn: ({ method }: { method: string }) => {
    transport.methods.push(method);
    let parse = (data: unknown) => data;
    const builder = {
      validator(schema: { parse(data: unknown): unknown }) {
        parse = (data) => schema.parse(data);
        return builder;
      },
      handler() {
        return async (input?: { data: unknown }) => {
          const data = input ? parse(input.data) : undefined;
          transport.send({ method, data });
          return null;
        };
      },
    };
    return builder;
  },
  getRouterInstance: vi.fn(),
}));

import * as actions from './legacy-plan-actions';
import { loadMeetPage } from './page-loader';
import { fetchWorkspaces } from './workspace-actions';

it('keeps all twelve Meet transports on POST and sends a JSON body for the workspace read', async () => {
  expect(transport.methods).toHaveLength(12);
  expect(transport.methods.every((method) => method === 'POST')).toBe(true);
  await fetchWorkspaces();
  expect(transport.send).toHaveBeenLastCalledWith({
    method: 'POST',
    data: {},
  });
});

it('passes structured paths and action tuples to the POST transport intact', async () => {
  const path = '/en/plans/plan?filter=%22quoted%22';
  await loadMeetPage({ data: { path } });
  expect(transport.send).toHaveBeenLastCalledWith({
    method: 'POST',
    data: { path },
  });
  const payload = { name: 'A "quoted" poll', allow_anonymous_updates: false };
  await actions.createPoll('plan', payload);
  expect(transport.send).toHaveBeenLastCalledWith({
    method: 'POST',
    data: ['plan', payload],
  });
  await actions.submitVote('plan', {
    userType: 'PLATFORM',
    pollId: 'poll',
    optionIds: ['one', 'two'],
  });
  expect(transport.send).toHaveBeenLastCalledWith({
    method: 'POST',
    data: [
      'plan',
      { userType: 'PLATFORM', pollId: 'poll', optionIds: ['one', 'two'] },
    ],
  });
});

it('retains the page validator at the transport boundary', async () => {
  await expect(
    loadMeetPage({ data: { path: '//evil.test' } })
  ).rejects.toThrow();
  await expect(
    loadMeetPage({ data: { path: `/${'x'.repeat(8192)}` } })
  ).rejects.toThrow();
});

it('declares an input validator on every Meet POST transport so the client always sends a JSON body', () => {
  for (const file of [
    'legacy-plan-actions.ts',
    'page-loader.ts',
    'workspace-actions.ts',
  ]) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    const transports = source.match(/createServerFn\(\{ method: 'POST' \}\)/g);
    const validators = source.match(/\.validator\(/g);
    expect(validators?.length ?? 0, file).toBe(transports?.length ?? 0);
  }
});
