import { createClient } from '@tuturuuu/supabase/next/server';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

export default async function Home() {
  const supabase = await createClient();
  const t = await getTranslations('calendar');

  const { data: workspaces, error: workspacesError } = await supabase
    .from('workspaces')
    .select('*');

  if (workspacesError) {
    console.error(workspacesError);
    notFound();
  }

  if (workspaces && workspaces.length > 0) {
    redirect(`/${workspaces[0].id}`);
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-4 text-center">
      <h1 className="text-2xl font-semibold">{t('select_workspace')}</h1>
      <p className="text-muted-foreground">
        {t('please_select_workspace_from_header')}
      </p>
    </div>
  );
}
