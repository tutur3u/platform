import type { PostEmail } from './types';
import { atom, useAtom } from 'jotai';

type PostConfig = {
  selected: string | null; // Use composite key: user_id-id
};

const configAtom = atom<PostConfig>({
  selected: null,
});

export function usePosts() {
  return useAtom(configAtom);
}

// Helper function to create a unique key for post email selection
export function createPostEmailKey(postEmail: PostEmail): string {
  return `${postEmail.user_id}-${postEmail.id}`;
}
