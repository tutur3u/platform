import type { SupabaseClient } from '@supabase/supabase-js';
import type { TutoringSessionCampusDatabase } from '@tuturuuu/types/db';
import type { Database } from '@tuturuuu/types/supabase';

type CampusInsert =
  TutoringSessionCampusDatabase['private']['Tables']['workspace_tutoring_sessions']['Insert'];

// Compiled with the web app; never invoked against a database.
export function assertCampusWriteSchema(
  client: SupabaseClient<TutoringSessionCampusDatabase>,
  generatedClient: SupabaseClient<Database>,
  row: CampusInsert
) {
  const retainsBaselineClient: SupabaseClient<Database> = client;
  const sessions = client.schema('private').from('workspace_tutoring_sessions');
  sessions.insert({ ...row, campus_override: 'North' });
  sessions.insert({ ...row, campus_override: null });
  sessions.update({ campus_override: 'South' });
  sessions.update({ campus_override: null });

  const invalidInsert = { ...row, campus_override: 42 };
  // @ts-expect-error Campus values remain nullable labels on inserts.
  sessions.insert(invalidInsert);
  // @ts-expect-error Campus values remain nullable labels on updates.
  sessions.update({ campus_override: 42 });
  const unknownUpdate = {
    campus_override: 'South',
    unknown_campus_field: true,
  };
  // @ts-expect-error The schema extension must preserve excess-property checks.
  sessions.update(unknownUpdate);

  void retainsBaselineClient;
  const generatedSessions = generatedClient
    .schema('private')
    .from('workspace_tutoring_sessions');
  // @ts-expect-error The generated baseline requires the admitted schema extension.
  generatedSessions.update({ campus_override: 'North' });
}
