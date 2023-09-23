import { getCurrentSupabaseUser } from '@/lib/user-helper';
import { VercelToolbar } from '@vercel/toolbar/next';

export async function StaffToolbar() {
  const user = await getCurrentSupabaseUser();
  const isEmployee = user?.email?.endsWith('@tuturuuu.com');

  console.log('isEmployee', isEmployee);

  return isEmployee ? <VercelToolbar /> : null;
}
