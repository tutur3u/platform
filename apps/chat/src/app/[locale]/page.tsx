import { redirect } from 'next/navigation';

// Async so the redirect is thrown before streaming starts; a sync server
// component is streamed as an element and its redirect reaches the error
// boundary instead of the router.
export default async function HomePage() {
  redirect('/personal');
}
