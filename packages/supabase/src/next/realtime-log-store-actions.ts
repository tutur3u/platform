'use server';

import { createAdminClient } from './server';

export default async function saveRealtimeLogs(
  wsId: string,
  userId: string | null,
  kind: string,
  message: string,
  data?: any
) {
  const sbAdmin = await createAdminClient();

  const { error } = await sbAdmin.from('realtime_logs').insert([
    {
      ws_id: wsId,
      user_id: userId,
      kind,
      message,
      data,
    },
  ]);

  if (error) {
    console.error(error);
    throw new Error(error.message);
  }
}
