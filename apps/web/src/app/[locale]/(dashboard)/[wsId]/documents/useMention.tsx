import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createClient } from '@/utils/supabase/client';
import Mention from '@tiptap/extension-mention';
import { cx } from 'class-variance-authority';
import { AtSign } from 'lucide-react';
import { useRouter } from 'next/router';
import { SuggestionItem, createSuggestionItems } from 'novel/extensions';
import { useEffect, useState } from 'react';

async function getWorkspaceUsers(wsId: string) {
  const supabase = createClient();

  const queryBuilder = supabase
    .from('workspace_members')
    .select(
      'id:user_id, ...users(display_name, ...user_private_details(email))'
    )
    .eq('ws_id', wsId)
    .order('user_id');

  const { data, error } = await queryBuilder;
  if (error) throw error;

  return { data } as { data: WorkspaceUser[] };
}

// Create a hook to manage suggestion items
export function useMentionSuggestions() {
  const router = useRouter();
  const wsId = router.query.wsId as string;
  const [suggestionItems, setSuggestionItems] = useState<SuggestionItem[]>([]);

  useEffect(() => {
    async function initializeSuggestions() {
      if (wsId) {
        const { data: users } = await getWorkspaceUsers(wsId);
        const items = createSuggestionItems(
          users.map((user) => ({
            title: user.display_name ?? '',
            description: user.email ?? '',
            searchTerms: [
              (user.display_name ?? '').toLowerCase(),
              (user.email ?? '').toLowerCase(),
            ],
            icon: <AtSign size={18} />,
          }))
        );
        setSuggestionItems(items);
      }
    }

    initializeSuggestions();
  }, [wsId]);

  return suggestionItems;
}

// Configure the mention extension
const configureMention = () => {
  const suggestionItems = useMentionSuggestions();

  return Mention.configure({
    HTMLAttributes: {
      class: cx('text-primary mention'),
    },
    suggestion: {
      items: () => suggestionItems,
      char: '@',
      allowSpaces: true,
    },
  });
};

export default configureMention;
