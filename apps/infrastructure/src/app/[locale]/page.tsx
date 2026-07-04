import { INTERNAL_WORKSPACE_SLUG } from '@tuturuuu/utils/constants';
import { redirect } from 'next/navigation';

export default function Page() {
  redirect(`/${INTERNAL_WORKSPACE_SLUG}`);
}
