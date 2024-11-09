// import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
// import { createClient } from '@/utils/supabase/client';
// import Mention from '@tiptap/extension-mention';
// import { AtSign } from 'lucide-react';
// import { createSuggestionItems } from 'novel/extensions';

// async function getWorkspaceUsers(wsId: string) {
//   const supabase = createClient();

//   const queryBuilder = supabase
//     .from('workspace_members')
//     .select(
//       'id:user_id, ...users(display_name, ...user_private_details(email))'
//     )
//     .eq('ws_id', wsId)
//     .order('user_id');

//   const { data, error } = await queryBuilder;
//   if (error) throw error;

//   return { data } as { data: WorkspaceUser[] };
// }

// // Initial empty suggestion items
// let suggestionItems = createSuggestionItems([]);

// // Function to update suggestion items with users
// export async function initializeSuggestionItems(wsId: string) {
//   const { data: users } = await getWorkspaceUsers(wsId);
//   suggestionItems = createSuggestionItems(
//     users.map((user) => ({
//       title: user.display_name ?? '',
//       description: user.email ?? '',
//       searchTerms: [
//         (user.display_name ?? '').toLowerCase(),
//         (user.email ?? '').toLowerCase(),
//       ],
//       icon: <AtSign size={18} />,
//     }))
//   );
//   return suggestionItems;
// }

// export const mentionCommand = Mention.configure({
//   HTMLAttributes: {
//     class: 'mention',
//   },
//   suggestion: {
//     items: () => suggestionItems,
//     char: '@',
//     allowSpaces: true,
//   },
// });
