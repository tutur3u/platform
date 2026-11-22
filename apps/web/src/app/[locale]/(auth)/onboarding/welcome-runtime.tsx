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
import { parseWelcomeStep } from './welcome-model';

export type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

  return (
    <WelcomeFlow
      avatarUser={{
        avatar_url: user.avatar_url ?? null,
        display_name: user.display_name ?? null,
        id: user.id,
      }}
      calendarOrigin={getCalendarAppOrigin()}
      displayName={user.display_name?.trim() || ''}
      initialStep={parseWelcomeStep(firstValue(params.step))}
      tasksOrigin={getTasksAppOrigin()}
    />
  );
}
