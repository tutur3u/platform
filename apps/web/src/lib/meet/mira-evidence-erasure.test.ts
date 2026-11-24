import { describe, expect, it, vi } from 'vitest';
import {
  deleteMeetingErasingMira,
  deleteWorkspaceErasingMira,
} from './mira-evidence-erasure';

const WS = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const MEETING = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';

function admin(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  const schema = vi.fn(() => ({ rpc }));
  return { client: { schema }, rpc, schema };
}

describe('deleteMeetingErasingMira', () => {
  it('calls the private erase-and-delete function for exactly that meeting', async () => {
    const { client, rpc, schema } = admin({ data: 'deleted', error: null });
    await expect(
      deleteMeetingErasingMira(client, WS, MEETING)
    ).resolves.toEqual({ data: 'deleted', error: null });
    expect(schema).toHaveBeenCalledWith('private');
    expect(rpc).toHaveBeenCalledWith('delete_meeting_erasing_mira', {
      p_ws_id: WS,
      p_meeting_id: MEETING,
    });
  });

  it('reports a missing meeting as not deleted, not as an error', async () => {
    const { client } = admin({ data: 'not_deleted', error: null });
    await expect(
      deleteMeetingErasingMira(client, WS, MEETING)
    ).resolves.toEqual({ data: 'not_deleted', error: null });
  });

  it('passes a database error through and refuses an unexpected answer', async () => {
    const failure = { code: '23503' };
    expect(
      await deleteMeetingErasingMira(
        admin({ data: null, error: failure }).client,
        WS,
        MEETING
      )
    ).toEqual({ data: null, error: failure });
    const odd = await deleteMeetingErasingMira(
      admin({ data: 'maybe', error: null }).client,
      WS,
      MEETING
    );
    expect(odd.data).toBeNull();
    expect(odd.error).toBeInstanceOf(Error);
  });
});

describe('deleteWorkspaceErasingMira', () => {
  it('deletes any workspace by default', async () => {
    const { client, rpc } = admin({ data: 'deleted', error: null });
    await expect(deleteWorkspaceErasingMira(client, WS)).resolves.toEqual({
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith('delete_workspace_erasing_mira', {
      p_ws_id: WS,
      p_only_non_personal: false,
    });
  });

  it('asks the database to leave a Personal workspace alone when told to', async () => {
    const { client, rpc } = admin({ data: 'not_deleted', error: null });
    await expect(
      deleteWorkspaceErasingMira(client, WS, { onlyNonPersonal: true })
    ).resolves.toEqual({ error: null });
    expect(rpc).toHaveBeenCalledWith('delete_workspace_erasing_mira', {
      p_ws_id: WS,
      p_only_non_personal: true,
    });
  });

  it('treats an already-deleted workspace like a filtered delete, and surfaces failures', async () => {
    expect(
      await deleteWorkspaceErasingMira(
        admin({ data: 'not_deleted', error: null }).client,
        WS
      )
    ).toEqual({ error: null });
    const failure = { code: '57014' };
    expect(
      await deleteWorkspaceErasingMira(
        admin({ data: null, error: failure }).client,
        WS
      )
    ).toEqual({ error: failure });
    expect(
      (
        await deleteWorkspaceErasingMira(
          admin({ data: null, error: null }).client,
          WS
        )
      ).error
    ).toBeInstanceOf(Error);
  });
});

describe('before the migration that adds the functions is applied', () => {
  const missing = { code: 'PGRST202', message: 'Could not find the function' };

  function adminWithTables(rpcResult: { data: unknown; error: unknown }) {
    const eq = vi.fn();
    const select = vi.fn();
    const chain: Record<string, unknown> = {};
    chain.eq = (column: string, value: unknown) => {
      eq(column, value);
      return chain;
    };
    chain.select = (columns: string) => {
      select(columns);
      return Promise.resolve({ data: [{ id: MEETING }], error: null });
    };
    chain.then = (resolve: (value: unknown) => unknown) =>
      resolve({ error: null });
    const from = vi.fn(() => ({ delete: () => chain }));
    const rpc = vi.fn().mockResolvedValue(rpcResult);
    return { client: { schema: () => ({ rpc }), from }, eq, from, select };
  }

  it('falls back to the bare workspace delete, which RESTRICT still guards', async () => {
    const { client, from, eq } = adminWithTables({
      data: null,
      error: missing,
    });
    await expect(
      deleteWorkspaceErasingMira(client, WS, { onlyNonPersonal: true })
    ).resolves.toEqual({ error: null });
    expect(from).toHaveBeenCalledWith('workspaces');
    expect(eq).toHaveBeenCalledWith('id', WS);
    expect(eq).toHaveBeenCalledWith('personal', false);
  });

  it('falls back to the bare meeting delete, scoped to its workspace', async () => {
    const { client, from, eq, select } = adminWithTables({
      data: null,
      error: { code: '42883' },
    });
    await expect(
      deleteMeetingErasingMira(client, WS, MEETING)
    ).resolves.toEqual({ data: 'deleted', error: null });
    expect(from).toHaveBeenCalledWith('workspace_meetings');
    expect(eq).toHaveBeenCalledWith('id', MEETING);
    expect(eq).toHaveBeenCalledWith('ws_id', WS);
    expect(select).toHaveBeenCalledWith('id');
  });

  it('does not fall back on any other database error', async () => {
    const { client, from } = adminWithTables({
      data: null,
      error: { code: '23503' },
    });
    expect(await deleteWorkspaceErasingMira(client, WS)).toEqual({
      error: { code: '23503' },
    });
    expect(from).not.toHaveBeenCalled();
  });
});
