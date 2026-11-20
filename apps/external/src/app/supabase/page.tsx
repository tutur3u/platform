import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';

export default async function Supabase() {
  const supabase = await createClient();

  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user) return null;

  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await admin
    .from('ai_chats')
    .select('id, model, is_public, created_at, summary')
    .eq('creator_id', user.id)
    .limit(1);

  if (error) {
    console.error('Error fetching AIChat instance:', error);
    return <div>Error loading AIChat instance</div>;
  }

  return data.map((chat) => (
    <div key={chat.id}>
      Types
      <p>AIChat instance created with model: {chat?.model}</p>
      <p>AIChat ID: {chat?.id}</p>
      <p>Is public: {chat?.is_public ? 'Yes' : 'No'}</p>
      <p>Created at: {chat?.created_at}</p>
      <p>Summary: {chat?.summary}</p>
    </div>
  ));
}
