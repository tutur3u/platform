/** SQL adapter for provider/bookkeeping unit tests; locking is tested against PostgreSQL. */
export function createVaultSqlFixture(store: {
  devices: { id: string; active_user_id: string | null }[];
  sessions: {
    device_id: string;
    user_id: string;
    session_ciphertext: string;
    last_route: string | null;
    last_workspace_id: string | null;
    avatar_url?: string | null;
    display_name?: string | null;
  }[];
}) {
  return async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join('?').replace(/\s+/g, ' ').trim();
    if (query.startsWith('select active_user_id')) return store.devices;
    if (query.startsWith('select session_ciphertext')) {
      return store.sessions.filter(
        (row) => row.device_id === values[0] && row.user_id === values[1]
      );
    }
    if (query.startsWith('delete from')) {
      const index = store.sessions.findIndex(
        (row) => row.device_id === values[0] && row.user_id === values[1]
      );
      if (index >= 0) store.sessions.splice(index, 1);
      return Object.assign([], { count: index >= 0 ? 1 : 0 });
    }
    if (query.startsWith('update private.web_account_devices')) {
      const row = store.devices.find((entry) => entry.id === values[1]);
      if (row && typeof values[0] === 'string') row.active_user_id = values[0];
      return Object.assign([], { count: row ? 1 : 0 });
    }
    if (query.startsWith('update private.web_account_sessions')) {
      const outgoing = query.includes('coalesce');
      const row = store.sessions.find(
        (entry) =>
          entry.device_id === values[outgoing ? 5 : 4] &&
          entry.user_id === values[outgoing ? 6 : 5]
      );
      if (row) {
        if (typeof values[outgoing ? 0 : 2] === 'string')
          row.session_ciphertext = values[outgoing ? 0 : 2] as string;
        if (!outgoing) {
          row.avatar_url = values[0] as string | null;
          row.display_name = values[1] as string | null;
        }
        if (outgoing && typeof values[2] === 'string') {
          row.last_route = values[2];
          if (typeof values[4] === 'string' || values[4] === null)
            row.last_workspace_id = values[4];
        }
      }
      return Object.assign([], { count: row ? 1 : 0 });
    }
    throw new Error(`Unhandled fixture SQL: ${query}`);
  };
}
