import { redirect } from 'next/navigation';

// Resolve the redirect before the bridge starts the RSC stream.
export default async function HomePage() {
  redirect('/personal');
}
