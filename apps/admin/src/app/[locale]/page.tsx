import { INTERNAL_WORKSPACE_SLUG } from '@tuturuuu/utils/constants';
import { redirect } from 'next/navigation';

// Async so the redirect is thrown before streaming starts (see chat's root page).
export default async function Page() {
  redirect(`/${INTERNAL_WORKSPACE_SLUG}`);
}
