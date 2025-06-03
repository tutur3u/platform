import { createClient } from '@tuturuuu/supabase/next/server';

export default async function Supabase() {
  const supabase = await createClient();

  const { data: aiChatInstance, error } = await supabase
    .from('ai_chats')
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('Error fetching AIChat instance:', error);
    return <div>Error loading AIChat instance</div>;
  }

  return (
    <div>
      Types
      <p>AIChat instance created with model: {aiChatInstance?.model}</p>
      <p>AIChat ID: {aiChatInstance?.id}</p>
      <p>Is public: {aiChatInstance?.is_public ? 'Yes' : 'No'}</p>
      <p>Created at: {aiChatInstance?.created_at}</p>
      <p>Summary: {aiChatInstance?.summary}</p>
    </div>
  );
}
