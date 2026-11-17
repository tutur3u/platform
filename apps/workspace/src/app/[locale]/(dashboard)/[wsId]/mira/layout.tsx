import { redirect } from 'next/navigation';

/** Mira lives on the personal workspace home; this path only redirects. */
export default function MiraLayout(): never {
  redirect('/personal');
}
