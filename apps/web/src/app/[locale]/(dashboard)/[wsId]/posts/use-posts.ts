import type { PostEmail } from './types';
import { atom, useAtom } from 'jotai';

type PostConfig = {
  selected: string | null; // Use composite key: user_id-id
};

// Track optimistically sent emails by their composite key
type OptimisticSentEmails = Set<string>;

// Track emails currently being sent (loading state)
type OptimisticLoadingEmails = Set<string>;

const configAtom = atom<PostConfig>({
  selected: null,
});

// Atom to track optimistically sent emails
const optimisticSentEmailsAtom = atom<OptimisticSentEmails>(new Set<string>());

// Atom to track emails currently being sent
const optimisticLoadingEmailsAtom = atom<OptimisticLoadingEmails>(
  new Set<string>()
);

export function usePosts() {
  return useAtom(configAtom);
}

// Hook to manage optimistically sent emails
export function useOptimisticSentEmails() {
  return useAtom(optimisticSentEmailsAtom);
}

// Hook to manage optimistically loading emails
export function useOptimisticLoadingEmails() {
  return useAtom(optimisticLoadingEmailsAtom);
}

// Helper function to create a unique key for post email selection
export function createPostEmailKey(postEmail: PostEmail): string {
  return `${postEmail.user_id}-${postEmail.id}`;
}

// Helper function to check if an email is optimistically sent
export function isOptimisticallySent(
  postEmail: PostEmail,
  optimisticSentEmails: OptimisticSentEmails
): boolean {
  const key = createPostEmailKey(postEmail);
  return optimisticSentEmails.has(key);
}

// Helper function to check if an email is optimistically loading
export function isOptimisticallyLoading(
  postEmail: PostEmail,
  optimisticLoadingEmails: OptimisticLoadingEmails
): boolean {
  const key = createPostEmailKey(postEmail);
  return optimisticLoadingEmails.has(key);
}

// Helper function to mark an email as optimistically sent
export function markAsOptimisticallySent(
  postEmail: PostEmail,
  optimisticSentEmails: OptimisticSentEmails,
  setOptimisticSentEmails: (emails: OptimisticSentEmails) => void
): void {
  const key = createPostEmailKey(postEmail);
  const newSet = new Set(optimisticSentEmails);
  newSet.add(key);
  setOptimisticSentEmails(newSet);
}

// Helper function to mark an email as optimistically loading
export function markAsOptimisticallyLoading(
  postEmail: PostEmail,
  optimisticLoadingEmails: OptimisticLoadingEmails,
  setOptimisticLoadingEmails: (emails: OptimisticLoadingEmails) => void
): void {
  const key = createPostEmailKey(postEmail);
  const newSet = new Set(optimisticLoadingEmails);
  newSet.add(key);
  setOptimisticLoadingEmails(newSet);
}

// Helper function to remove an email from optimistic loading
export function removeFromOptimisticLoading(
  postEmail: PostEmail,
  optimisticLoadingEmails: OptimisticLoadingEmails,
  setOptimisticLoadingEmails: (emails: OptimisticLoadingEmails) => void
): void {
  const key = createPostEmailKey(postEmail);
  const newSet = new Set(optimisticLoadingEmails);
  newSet.delete(key);
  setOptimisticLoadingEmails(newSet);
}
