import { createClient } from '@tuturuuu/supabase/next/server';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import {
  getCurrentUser,
  getUserDefaultWorkspace,
} from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getCalendarAppOrigin } from '@/lib/calendar-app-url';
import { resolveWelcomeEntry } from '@/lib/onboarding/welcome-gate';
import { getTasksAppOrigin } from '@/lib/tasks-app-url';
import { getUserOnboardingProgress } from './actions';
import { WelcomeFlow } from './welcome-flow';
import {
  PRODUCT_NEWS_CHANNEL,
  PRODUCT_NEWS_EVENT,
  parseWelcomeStep,
} from './welcome-model';

export type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function readProductNews(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('notification_preferences')
    .select('enabled')
    .is('ws_id', null)
    .eq('user_id', userId)
    .eq('event_type', PRODUCT_NEWS_EVENT)
    .eq('channel', PRODUCT_NEWS_CHANNEL);
  const rows = data ?? [];
  // Only an explicit opt-in shows as on; no row means the switch starts off.
  return {
    hasRow: rows.length > 0,
    optedIn: rows.some((row) => row.enabled),
  };
}

export async function WelcomeRuntime({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();

  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const progress = user ? await getUserOnboardingProgress() : null;
  const entry = resolveWelcomeEntry({
    progress,
    replay: firstValue(params.replay) === '1',
    signedIn: Boolean(user),
  });

  if (entry === 'login' || !user) redirect('/login');

  if (entry === 'workspace') {
    const workspace = await getUserDefaultWorkspace();
    redirect(
      `/${
        workspace
          ? toWorkspaceSlug(workspace.id, {
              personal: Boolean(workspace.personal),
            })
          : 'personal'
      }`
    );
  }

  const productNews = await readProductNews(user.id);

  return (
    <WelcomeFlow
      avatarUser={{
        avatar_url: user.avatar_url ?? null,
        display_name: user.display_name ?? null,
        id: user.id,
      }}
      calendarOrigin={getCalendarAppOrigin()}
      displayName={user.display_name?.trim() || ''}
      hasProductNewsRow={productNews.hasRow}
      initialProductNews={productNews.optedIn}
      initialStep={parseWelcomeStep(firstValue(params.step))}
      tasksOrigin={getTasksAppOrigin()}
    />
  );
}
