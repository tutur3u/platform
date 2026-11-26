import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';

type StorageError = { message: string };
type QueryResult = { data: unknown; error: StorageError | null };
type ReadTable = {
  select(columns: string): {
    eq(
      column: string,
      value: string
    ): { maybeSingle(): PromiseLike<QueryResult> };
  };
};
type GrantTable = ReadTable & {
  upsert(
    row: { link_id: string },
    options: { ignoreDuplicates: boolean }
  ): PromiseLike<QueryResult>;
  delete(): { eq(column: string, value: string): PromiseLike<QueryResult> };
};

const mappingSchema = z.object({
  link_id: z.uuid(),
  meeting_id: z.uuid().nullable(),
  owner_id: z.uuid(),
  owner_subject: z.string(),
});
const openResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('room'), meetingId: z.uuid() }),
  z.object({ kind: z.literal('conflict') }),
  z.object({ kind: z.literal('denied') }),
]);

type OpenInput = {
  p_class_id: string;
  p_link_id: string;
  p_name: string;
  p_owner_id: string;
  p_subject: string;
  p_ws_id: string;
};

export function liveClassStore(admin: TypedSupabaseClient) {
  // The private tables and service RPC are introduced by this change.
  const privateDb = admin.schema('private') as unknown as {
    from(name: 'upskii_live_class_grants'): GrantTable;
    from(name: 'upskii_live_class_rooms'): ReadTable;
  };
  const grants = () => privateDb.from('upskii_live_class_grants');

  return {
    async hasGrant(linkId: string) {
      const { data, error } = await grants()
        .select('link_id')
        .eq('link_id', linkId)
        .maybeSingle();
      if (error) throw new Error('Could not read Meet consent');
      return data !== null;
    },
    async setGrant(linkId: string, granted: boolean) {
      const { error } = granted
        ? await grants().upsert({ link_id: linkId }, { ignoreDuplicates: true })
        : await grants().delete().eq('link_id', linkId);
      if (error) throw new Error('Could not update Meet consent');
    },
    async findRoom(classId: string) {
      const { data, error } = await privateDb
        .from('upskii_live_class_rooms')
        .select('meeting_id, owner_id, owner_subject, link_id')
        .eq('class_id', classId)
        .maybeSingle();
      if (error) throw new Error('Could not read the live class room');
      return mappingSchema.nullable().parse(data);
    },
    async openRoom(input: OpenInput) {
      const rpc = admin as unknown as {
        rpc(
          name: 'open_upskii_live_class_room',
          args: OpenInput
        ): PromiseLike<QueryResult>;
      };
      const { data, error } = await rpc.rpc(
        'open_upskii_live_class_room',
        input
      );
      if (error) throw new Error('Could not open the live class room');
      return openResultSchema.parse(data);
    },
  };
}
