import { notFound } from 'next/navigation';

// The workspace app has no landing page. The locale-only path must not fall
// through to `/[wsId]` as a workspace named after the locale; signed-in users
// are redirected to their workspace by the proxy before this renders.
export default async function WorkspaceRootPage() {
  notFound();
}
