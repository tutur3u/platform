export function calendarSpikeOperatorFixture() {
  const profile = {
    eq: () => profile,
    retry: () => profile,
    limit: async () => ({
      data: [{ user_id: 'operator-id', deleted: false }],
      error: null,
    }),
  };
  const member = {
    eq: () => member,
    retry: () => member,
    maybeSingle: async () => ({
      data: { user_id: 'operator-id' },
      error: null,
    }),
  };
  return {
    from(table: string) {
      if (table === 'user_private_details') return { select: () => profile };
      if (table === 'workspace_members') return { select: () => member };
      return undefined;
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: {
            user: {
              id: 'operator-id',
              email: 'ops@example.test',
              email_confirmed_at: '2026-10-01T00:00:00Z',
            },
          },
          error: null,
        }),
      },
    },
  };
}
