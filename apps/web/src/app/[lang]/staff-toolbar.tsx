import { getCurrentSupabaseUser } from '@/lib/user-helper';
import { VercelToolbar } from '@vercel/toolbar/next';

export async function StaffToolbar() {
  const enabled = false;

  const user = enabled ? await getCurrentSupabaseUser() : null;
  const isEmployee = user?.email?.endsWith('@tuturuuu.com') ?? false;

  const showToolbar = enabled && isEmployee;

  return showToolbar ? <VercelToolbar /> : null;
}
