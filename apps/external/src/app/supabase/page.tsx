import { createClient } from '@tuturuuu/supabase/next/server';

export default async function Supabase() {
  const supabase = await createClient();

  const { data, error } = await supabase.from('ai_chats').select('*');

  if (error) {
    console.error('Error fetching AIChat instance:', error);
    return <div>Error loading AIChat instance</div>;
  }

  return data.map((chat) => (
    <div>
      Types
      <p>AIChat instance created with model: {chat?.model}</p>
      <p>AIChat ID: {chat?.id}</p>
      <p>Is public: {chat?.is_public ? 'Yes' : 'No'}</p>
      <p>Created at: {chat?.created_at}</p>
      <p>Summary: {chat?.summary}</p>
    </div>
  ));
}
