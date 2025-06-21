import { createClient } from '@ncthub/supabase/next/server';

export const getChats = async () => {
  const supabase = await createClient();

  const { data, count, error } = await supabase
    .from('ai_chats')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return { data: [], count: 0 };
  }

  return { data, count };
};
