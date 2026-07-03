import { redirect } from 'next/navigation';
import { getHiveAppOrigin } from '@/lib/hive-app-url';

// The hive experience has moved to the dedicated, workspace-agnostic hive app
// (apps/hive). This route redirects there to preserve existing links; the hive
// app enforces its own whitelist/access control.
export default function HiveRedirectPage() {
  redirect(getHiveAppOrigin());
}
