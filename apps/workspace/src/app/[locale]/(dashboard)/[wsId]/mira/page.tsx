import { redirect } from 'next/navigation';

/** Mira lives on the personal workspace home; this path only redirects. */
export default async function MiraPage(): Promise<never> {
  redirect('/personal');
}
