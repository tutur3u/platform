import { createClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';

export default async function CalendarHistoryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { wsId } = await params;

  if (user?.email?.endsWith('@tuturuuu.com')) {
    return redirect(`/${wsId}/calendar`);
  }

  return children;
}
