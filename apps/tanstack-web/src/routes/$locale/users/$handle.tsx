import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { User } from '@tuturuuu/icons';
import {
  type CommunityUserProfile,
  getCommunityUserProfileByHandle,
} from '@tuturuuu/internal-api/users-server';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { normalizeAvatarImageSrc } from '@tuturuuu/utils/avatar-url';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { requireCurrentUser } from '../../../lib/platform/auth-gate';
import { createPageHead } from '../../../lib/platform/head';
import type { Locale } from '../../../lib/platform/locale';
import { resolveMessagesLocale } from '../../../lib/platform/messages';

type UserProfileRouteParams = {
  handle: string;
  locale: string;
};

const loadCommunityUserProfile = createServerFn({ method: 'GET' })
  .validator((data: { handle: string }) => data)
  .handler(async ({ data }): Promise<CommunityUserProfile | null> => {
    return getCommunityUserProfileByHandle(data.handle, getRequestHeaders());
  });

const messagesByLocale: Record<
  Locale,
  { description: string; title: string; unknownProfile: string }
> = {
  en: {
    title: 'Community Profile',
    description: 'View a Tuturuuu community member profile.',
    unknownProfile: 'Community member',
  },
  vi: {
    title: 'Hồ sơ cộng đồng',
    description: 'Xem hồ sơ thành viên cộng đồng Tuturuuu.',
    unknownProfile: 'Thành viên cộng đồng',
  },
};

const COMMUNITY_PROFILE_CACHE_HEADERS = {
  'Cache-Control': 'private, no-store',
};

export const Route = createFileRoute('/$locale/users/$handle')({
  component: UserProfileRoutePage,
  head: ({ loaderData, params }) => {
    const { locale: routeLocale } = params as UserProfileRouteParams;
    const locale = resolveMessagesLocale(routeLocale);
    const messages = messagesByLocale[locale];
    const profile = loaderData as CommunityUserProfile | undefined;
    const title = profile?.display_name
      ? `${profile.display_name} - ${messages.title}`
      : messages.title;

    return createPageHead({
      description: messages.description,
      locale,
      title,
    });
  },
  headers: () => COMMUNITY_PROFILE_CACHE_HEADERS,
  loader: async ({ params }) => {
    const { handle = '', locale = '' } =
      params as Partial<UserProfileRouteParams>;
    await requireCurrentUser({
      locale,
      nextPath: `/users/${handle}`,
    });

    const profile = await loadCommunityUserProfile({ data: { handle } });

    if (!profile) {
      throw notFound();
    }

    return profile;
  },
});

function UserProfileRoutePage() {
  const { locale } = Route.useParams() as UserProfileRouteParams;
  const profile = Route.useLoaderData() as CommunityUserProfile;
  const messages = messagesByLocale[resolveMessagesLocale(locale)];
  const displayName = profile.display_name ?? messages.unknownProfile;
  const handle = profile.handle ?? '';
  const avatarUrl = normalizeAvatarImageSrc(profile.avatar_url);

  return (
    <main className="flex min-h-screen w-full flex-col bg-background">
      <section className="mx-auto flex w-full max-w-5xl flex-col px-4 pt-14 pb-10">
        <div className="relative flex min-h-80 items-center justify-center">
          <div className="h-64 w-full overflow-hidden rounded-lg border border-border bg-muted/40">
            <img
              src="/media/background/placeholder.jpg"
              alt=""
              width={1640}
              height={924}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="absolute top-36 flex flex-col items-center justify-center gap-2 text-center md:top-44 lg:top-52">
            <Avatar className="h-40 w-40 border border-border bg-background text-6xl shadow-lg">
              <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
              <AvatarFallback className="font-semibold">
                {profile.display_name ? (
                  getInitials(profile.display_name)
                ) : (
                  <User className="h-8 w-8" />
                )}
              </AvatarFallback>
            </Avatar>
            <h1 className="font-bold text-3xl text-foreground">
              {displayName}
            </h1>
            {handle ? (
              <p className="font-semibold text-lg text-primary">@{handle}</p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
