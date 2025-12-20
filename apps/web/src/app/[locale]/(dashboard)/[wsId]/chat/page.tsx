import { createClient } from '@tuturuuu/supabase/next/server';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import RealtimeChatContent from './realtime-chat-content';

export default async function RealtimeChatPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, isRoot }) => {
        const supabase = await createClient();

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) redirect('/login');
        if (!isRoot || !isValidTuturuuuEmail(user.email || ''))
          redirect(`/${wsId}`);

        return <RealtimeChatContent wsId={wsId} userId={user.id} />;
      }}
    </WorkspaceWrapper>
  );
}
