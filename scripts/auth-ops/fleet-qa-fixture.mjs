import assert from 'node:assert/strict';
import {
  ACCOUNTS,
  createHelper,
  validateReceipt,
  lookupEmail,
} from './fleet-qa.mjs';
export const config = {
  ack: 'D241_TEST_ACK',
  projectRef: 'abcdefghijklmnopqrst',
};
export const ids = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
];
export const wsids = [
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
];
export const clock = () => new Date('2026-11-16T10:00:00.000Z');
export function fixture({
  cascadePersonal = false,
  guardPersonal = true,
} = {}) {
  let receipt;
  const writes = [];
  const users = [];
  const workspaces = [];
  const memberships = [];
  const calls = [];
  const profiles = { users: [], user_private_details: [] };
  const store = {
    reserve: async (r) => {
      assert.equal(receipt, undefined);
      receipt = structuredClone(r);
    },
    save: async (r) => {
      validateReceipt(r);
      receipt = structuredClone(r);
      writes.push(structuredClone(r));
    },
    read: async () => structuredClone(receipt),
  };
  const admin = {
    listUsers: async (args) => {
      calls.push(['list', args]);
      return {
        data: {
          users: structuredClone(
            users.filter((u) => u.email?.toLowerCase().includes(args.filter))
          ),
        },
      };
    },
    createUser: async (args) => {
      calls.push(['create', args]);
      const i = users.length;
      assert.equal(receipt.accounts[i].outcome, 'create-intent');
      const user = { id: ids[i], ...args };
      users.push(user);
      workspaces.push({
        id: wsids[i],
        creator_id: user.id,
        personal: true,
        name: 'Personal',
        created_at: receipt.startedAt,
      });
      memberships.push({ ws_id: wsids[i], user_id: user.id });
      return { data: { user } };
    },
    getUserById: async (id) => {
      calls.push(['get', id]);
      const user = users.find((u) => u.id === id);
      return user
        ? { data: { user } }
        : { error: { code: 'user_not_found', status: 404 } };
    },
    generateLink: async (args) => {
      calls.push(['link', args]);
      return {
        data: {
          user: users.find((u) => u.email === args.email),
          properties: {
            hashed_token: `synthetic_token_hash_${args.email === ACCOUNTS.a1 ? 'a1' : 'a2'}`,
            action_link: `https://${config.projectRef}.supabase.co/auth/v1/verify?type=magiclink&token=synthetic&redirect_to=https%3A%2F%2Ftuturuuu.com%2Flogin`,
          },
        },
      };
    },
    signOut: async (...args) => {
      calls.push(['signout', ...args]);
      return { data: {} };
    },
    deleteUser: async (id) => {
      calls.push(['delete', id]);
      users.splice(
        users.findIndex((u) => u.id === id),
        1
      );
      for (let i = memberships.length - 1; i >= 0; i--)
        if (memberships[i].user_id === id) memberships.splice(i, 1);
      if (cascadePersonal)
        for (let i = workspaces.length - 1; i >= 0; i--)
          if (workspaces[i].creator_id === id && workspaces[i].personal)
            workspaces.splice(i, 1);
      return { data: {} };
    },
  };
  const verified = new Set();
  const publicClient = {
    auth: {
      verifyOtp: async (args) => {
        calls.push(['verify', args]);
        if (verified.has(args.token_hash))
          return { error: { code: 'otp_expired' } };
        verified.add(args.token_hash);
        const label = args.token_hash.endsWith('a2') ? 'a2' : 'a1';
        return {
          data: {
            user: users.find((u) => u.email === ACCOUNTS[label]),
            session: { access_token: 'synthetic.jwt.only' },
          },
        };
      },
    },
  };
  function from(table) {
    let operation = 'select';
    const filters = [];
    const q = {
      select: () => q,
      delete: () => {
        operation = 'delete';
        return q;
      },
      eq: (k, v) => {
        filters.push([k, v]);
        return q;
      },
      limit: () => q,
      then(resolve, reject) {
        calls.push(['table', table, operation, structuredClone(filters)]);
        const list =
          table === 'workspaces'
            ? workspaces
            : table === 'workspace_members'
              ? memberships
              : (profiles[table] ?? []);
        const found = list.filter((row) =>
          filters.every(([k, v]) => row[k] === v)
        );
        if (
          operation === 'delete' &&
          table === 'workspaces' &&
          guardPersonal &&
          found.some(
            (w) => w.personal && users.some((u) => u.id === w.creator_id)
          )
        )
          return Promise.resolve({
            data: null,
            error: {
              code: '23514',
              message: 'Personal workspaces cannot be deleted manually',
            },
          }).then(resolve, reject);
        if (operation === 'delete')
          for (const w of found) {
            list.splice(list.indexOf(w), 1);
            for (let i = memberships.length - 1; i >= 0; i--)
              if (memberships[i].ws_id === w.id) memberships.splice(i, 1);
          }
        return Promise.resolve({ data: structuredClone(found) }).then(
          resolve,
          reject
        );
      },
    };
    return q;
  }
  const client = { auth: { admin }, from };
  const helper = createHelper({
    client,
    publicClient,
    config,
    store,
    now: clock,
    listener: async () => ({
      port: 12345,
      closed: Promise.resolve('consumed'),
      stop: () => {},
    }),
    findAlias: (email) =>
      lookupEmail(
        async (url) => {
          const u = new URL(url);
          const result = await admin.listUsers({
            filter: u.searchParams.get('filter'),
            perPage: 2,
            page: 1,
          });
          return new Response(JSON.stringify(result.data));
        },
        `https://${config.projectRef}.supabase.co`,
        'synthetic-service-credential',
        email
      ),
  });
  return {
    helper,
    profiles,
    client,
    publicClient,
    admin,
    store,
    calls,
    writes,
    users,
    memberships,
    workspaces,
    receipt: () => receipt,
  };
}
